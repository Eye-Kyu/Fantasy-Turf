"use client";

/**
 * The live scoring screen. Works with no signal: every tap becomes a queued operation
 * saved on the phone, shown immediately, and sent to the server whenever a connection
 * exists. Each event has a client-made id, so sending twice never double-counts.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newClientId } from "@/lib/client-id";
import type { EventType } from "@/lib/domain";
import { type EventView, type ScoringOp, applyOps, lastUndoable, mergeEvents, tallyScore } from "@/lib/match-events";

interface Team {
  id: string;
  name: string;
  players: { playerId: string; displayName: string }[];
}

const ACTIONS: { type: Exclude<EventType, "ASSIST">; label: string }[] = [
  { type: "GOAL", label: "Goal" },
  { type: "SAVE", label: "Save" },
  { type: "KEY_TACKLE", label: "Tackle" },
];
const LABEL: Record<EventType, string> = { GOAL: "Goal", ASSIST: "Assist", SAVE: "Save", KEY_TACKLE: "Tackle" };

/** Reads a saved array; a missing, blocked or corrupt store just means an empty one. */
function loadSaved<T>(key: string): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: everything still works until the page is closed.
  }
}

export function ScoringApp({
  matchId,
  matchNumber,
  teams,
  initialEvents,
}: {
  matchId: string;
  matchNumber: number;
  teams: Team[];
  initialEvents: EventView[];
}) {
  const storageKey = `scoring-queue:${matchId}`;
  const eventsKey = `scoring-events:${matchId}`;
  const [serverEvents, setServerEvents] = useState(initialEvents);
  const [queue, setQueue] = useState<ScoringOp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [selected, setSelected] = useState<{ teamId: string; playerId: string } | null>(null);
  const [assistFor, setAssistFor] = useState<EventView | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const sending = useRef(false);

  // Restore saved state after the first render (localStorage does not exist on the
  // server). The page itself may be an old cached copy when offline, so also merge in
  // the newest events this phone last got from the server.
  useEffect(() => {
    setQueue(loadSaved<ScoringOp>(storageKey));
    setServerEvents((current) => mergeEvents(current, loadSaved<EventView>(eventsKey)));
    setOnline(navigator.onLine);
    setLoaded(true);
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, [storageKey, eventsKey]);

  useEffect(() => {
    if (loaded) save(storageKey, queue);
  }, [queue, loaded, storageKey]);

  useEffect(() => {
    if (loaded) save(eventsKey, serverEvents);
  }, [serverEvents, loaded, eventsKey]);

  const events = useMemo(() => applyOps(serverEvents, queue), [serverEvents, queue]);
  const score = tallyScore(events, teams.map((team) => team.id));
  const nameOf = useMemo(() => new Map(teams.flatMap((t) => t.players.map((p) => [p.playerId, p.displayName] as const))), [teams]);

  const flush = useCallback(async () => {
    if (sending.current || queue.length === 0 || !navigator.onLine) return;
    sending.current = true;
    const sent = queue;
    try {
      const response = await fetch(`/api/matches/${matchId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: sent }),
      });
      if (response.status === 401) {
        setProblems(["You've been signed out. Sign in again; your queued events are kept on this phone."]);
        return;
      }
      if (!response.ok) return; // try again later; nothing was lost
      const data = (await response.json()) as {
        results: { clientId: string; status: "ok" | "rejected"; message?: string }[];
        events: EventView[];
      };
      const rejected = data.results.filter((r) => r.status === "rejected").map((r) => r.message ?? "An event was rejected");
      if (rejected.length > 0) setProblems((prev) => [...prev, ...rejected]);
      setServerEvents(data.events);
      // Drop what was sent (accepted or rejected); keep anything added while sending.
      setQueue((current) => current.slice(sent.length));
    } catch {
      // Offline or server unreachable: keep the queue and try again.
    } finally {
      sending.current = false;
    }
  }, [queue, matchId]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Send whenever something is waiting and we are online, and retry every 10 seconds.
  useEffect(() => {
    if (!loaded || !online) return;
    void flush();
    const timer = setInterval(() => void flush(), 10_000);
    return () => clearInterval(timer);
  }, [loaded, online, flush]);

  const add = (type: EventType, teamId: string, playerId: string, relatedClientId: string | null = null): EventView => {
    const op: ScoringOp = { kind: "add", clientId: newClientId(), type, teamId, playerId, relatedClientId, occurredAt: new Date().toISOString() };
    setQueue((q) => [...q, op]);
    return { ...op, voided: false };
  };

  const record = (type: Exclude<EventType, "ASSIST">) => {
    if (!selected) return;
    const event = add(type, selected.teamId, selected.playerId);
    setSelected(null);
    if (type === "GOAL") setAssistFor(event); // ask who assisted
  };

  const recordAssist = (teamId: string, playerId: string, goal: EventView) => {
    add("ASSIST", teamId, playerId, goal.clientId);
    setAssistFor(null);
  };

  const undo = () => {
    const last = lastUndoable(events);
    if (!last) return;
    setQueue((q) => [...q, { kind: "void", clientId: last.clientId }]);
    setAssistFor(null);
  };

  const teamOf = (teamId: string) => teams.find((t) => t.id === teamId);

  return (
    <main className="scoring">
      <p className="muted">
        <Link href={`/matches/${matchId}`}>← Match {matchNumber}</Link>
      </p>

      <div className="card scoreboard">
        {teams.map((team) => (
          <div key={team.id}>
            <div className="muted">{team.name}</div>
            <div className="goals">{score[team.id]}</div>
          </div>
        ))}
      </div>

      <div className={`sync ${online ? "" : "offline"}`} role="status">
        {online ? "Online" : "Offline: events are saved on this phone"} ·{" "}
        {queue.length === 0 ? "all synced" : `${queue.length} waiting to sync`}
        {online && queue.length > 0 && (
          <button type="button" className="small ghost" onClick={() => void flush()}>Sync now</button>
        )}
      </div>

      {problems.length > 0 && (
        <div className="notice error" role="alert">
          {problems.map((message, i) => <div key={i}>{message}</div>)}
          <button type="button" className="link" onClick={() => setProblems([])}>Dismiss</button>
        </div>
      )}

      {assistFor && (
        <div className="card">
          <h2>Assist for {nameOf.get(assistFor.playerId)}'s goal?</h2>
          <div className="chips">
            {teamOf(assistFor.teamId)?.players
              .filter((p) => p.playerId !== assistFor.playerId)
              .map((p) => (
                <button key={p.playerId} type="button" onClick={() => recordAssist(assistFor.teamId, p.playerId, assistFor)}>
                  {p.displayName}
                </button>
              ))}
            <button type="button" className="ghost" onClick={() => setAssistFor(null)}>No assist</button>
          </div>
        </div>
      )}

      <div className="teams">
        {teams.map((team) => (
          <div key={team.id} className="card">
            <h2>{team.name}</h2>
            <div className="chips">
              {team.players.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  className={selected?.playerId === p.playerId ? "" : "ghost"}
                  onClick={() => setSelected({ teamId: team.id, playerId: p.playerId })}
                >
                  {p.displayName}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="card action-bar">
          <strong>{nameOf.get(selected.playerId)}</strong>
          <div className="chips">
            {ACTIONS.map((a) => (
              <button key={a.type} type="button" onClick={() => record(a.type)}>{a.label}</button>
            ))}
            <button type="button" className="ghost" onClick={() => setSelected(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="row-actions">
        <button type="button" className="ghost" onClick={undo} disabled={!lastUndoable(events)}>Undo last event</button>
      </div>

      <h2>Log</h2>
      <ul className="plain card">
        {events.length === 0 && <li className="muted">Nothing recorded yet.</li>}
        {[...events].reverse().map((event) => (
          <li key={event.clientId} className={event.voided ? "voided" : ""}>
            <span>
              {LABEL[event.type]} · {nameOf.get(event.playerId)} <span className="muted">({teamOf(event.teamId)?.name})</span>
            </span>
            <span className="muted">{new Date(event.occurredAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" })}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
