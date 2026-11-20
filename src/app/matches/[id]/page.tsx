import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { areTeamsLocked } from "@/lib/gameweek";
import { tallyScore } from "@/lib/match-events";
import { matchSummaryText, whatsappShareUrl } from "@/lib/share";
import { formatClock, formatKickoff } from "@/lib/time";
import { requireUser } from "@/server/current-user";
import { NotFoundError } from "@/server/errors";
import { getMatchView, listMatchAudit } from "@/server/scoring";
import { Notices } from "../../components";
import {
  changePlayerAction, claimScoringAction, lockGameweekAction, motmAction, reconcileAction, releaseScoringAction, voidEventAction,
} from "./actions";

const LABEL = { GOAL: "Goal", ASSIST: "Assist", SAVE: "Save", KEY_TACKLE: "Key tackle" } as const;

function Post({ action, fields, label, ghost = true }: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  ghost?: boolean;
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" className={`small ${ghost ? "ghost" : ""}`}>{label}</button>
    </form>
  );
}

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { error, saved } = await searchParams;

  const db = getDb();
  let view;
  try {
    view = await getMatchView(db, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { match, gameweek, teams, events, userIdsPlaying } = view;

  const open = areTeamsLocked(gameweek.kickoffAt, new Date());
  const isOrganizer = can(user.role, "reconcileMatches");
  const playing = userIdsPlaying.has(user.userId);
  const isScorer = match.liveScorerId === user.userId;
  const canScore = open && !playing && (isOrganizer || (isScorer && !gameweek.lockedAt));
  const canClaim = open && !playing && !isScorer && !gameweek.lockedAt && (!match.liveScorerId || isOrganizer);
  const canReview = open && !playing && isOrganizer;
  const locked = gameweek.lockedAt !== null;

  const score = tallyScore(events, teams.map((team) => team.id));
  const playerName = new Map(teams.flatMap((team) => team.players.map((p) => [p.playerId, p.displayName] as const)));
  const teamName = new Map(teams.map((team) => [team.id, team.name] as const));
  const live = events.filter((e) => !e.voided);
  const involvement = new Map<string, { name: string; goals: number; assists: number }>();
  for (const e of live) {
    if (e.type !== "GOAL" && e.type !== "ASSIST") continue;
    const entry = involvement.get(e.playerId) ?? { name: playerName.get(e.playerId) ?? "?", goals: 0, assists: 0 };
    if (e.type === "GOAL") entry.goals += 1;
    else entry.assists += 1;
    involvement.set(e.playerId, entry);
  }
  const shareText = matchSummaryText({
    gameweekNumber: gameweek.number,
    matchNumber: match.number,
    teams: teams.map((team) => ({ name: team.name, goals: score[team.id] ?? 0 })),
    scorers: [...involvement.values()],
  });
  const audit = isOrganizer ? await listMatchAudit(db, id) : [];

  return (
    <main>
      <h1>Match {match.number} · Gameweek {gameweek.number}</h1>
      <p className="muted">
        <Link href={`/gameweeks/${gameweek.id}/teams`}>← Teams</Link> · Kick-off {formatKickoff(gameweek.kickoffAt)}
        {locked ? " · Gameweek locked" : match.reconciledAt ? " · Reconciled" : ""}
      </p>
      <Notices error={error} saved={saved} />

      <section className="card scoreboard">
        {teams.map((team) => (
          <div key={team.id}>
            <div className="muted">{team.name}</div>
            <div className="goals">{score[team.id]}</div>
          </div>
        ))}
      </section>

      <p>
        <a href={whatsappShareUrl(shareText)} target="_blank" rel="noopener noreferrer">Share result on WhatsApp</a>
        {" · "}
        <a href={`/api/matches/${id}/card`} target="_blank" rel="noopener noreferrer">Result card (image)</a>
      </p>

      <section className="card">
        <h2>Live scoring</h2>
        <p className="muted">
          {!open ? "Opens when teams lock, 3 hours before kick-off." : match.liveScorerId ? (isScorer ? "You are the live scorer." : "Someone is scoring this match.") : "Nobody is scoring yet."}
          {playing && " You play in this match, so you can't score or reconcile it."}
        </p>
        <div className="row-actions">
          {canScore && <Link className="button" href={`/matches/${id}/score`}>Open scoring screen</Link>}
          {canClaim && <Post action={claimScoringAction} fields={{ matchId: id }} label={match.liveScorerId ? "Take over scoring" : "Start scoring"} ghost={false} />}
          {match.liveScorerId && (isScorer || isOrganizer) && <Post action={releaseScoringAction} fields={{ matchId: id }} label="Release" />}
        </div>
      </section>

      <section className="card">
        <h2>Events</h2>
        {events.length === 0 && <p className="muted">Nothing recorded yet.</p>}
        <ul className="plain">
          {events.map((event) => {
            const sameTeam = teams.find((team) => team.id === event.teamId)?.players ?? [];
            return (
              <li key={event.clientId} className={event.voided ? "voided" : ""}>
                <span>
                  <span className="muted">{formatClock(new Date(event.occurredAt))}</span>{" "}
                  {LABEL[event.type]} · {playerName.get(event.playerId)} <span className="muted">({teamName.get(event.teamId)})</span>
                  {event.voided && " · voided"}
                </span>
                {canReview && !event.voided && (
                  <span className="row-actions">
                    <form action={changePlayerAction} className="row-actions">
                      <input type="hidden" name="matchId" value={id} />
                      <input type="hidden" name="clientId" value={event.clientId} />
                      <select name="playerId" defaultValue={event.playerId} aria-label="Player">
                        {sameTeam.map((p) => <option key={p.playerId} value={p.playerId}>{p.displayName}</option>)}
                      </select>
                      <button type="submit" className="small ghost">Change</button>
                    </form>
                    <Post action={voidEventAction} fields={{ matchId: id, clientId: event.clientId }} label="Void" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {canReview && (
        <section className="card">
          <h2>Reconciliation</h2>
          <p className="muted">
            Check the log above, fix anything wrong, then confirm. Changing events after confirming asks for another review.
            Mark who turned up on the <Link href={`/gameweeks/${gameweek.id}`}>gameweek page</Link> first, so team bonuses reach everyone who played.
          </p>
          <form action={motmAction} className="row-actions">
            <input type="hidden" name="matchId" value={id} />
            <label>Man of the match (+5)
              <select name="playerId" defaultValue={match.motmPlayerId ?? ""}>
                <option value="">None</option>
                {teams.flatMap((t) => t.players).map((p) => <option key={p.playerId} value={p.playerId}>{p.displayName}</option>)}
              </select>
            </label>
            <button type="submit" className="small">Save</button>
          </form>
          <div className="row-actions">
            {!locked && <Post action={reconcileAction} fields={{ matchId: id }} label={match.reconciledAt ? "Re-confirm match" : "Confirm match"} ghost={false} />}
            {!locked && (
              <Post action={lockGameweekAction} fields={{ matchId: id, gameweekId: gameweek.id }} label="Lock gameweek" />
            )}
          </div>
          {locked && <p className="muted">Locked. Changes from here are recorded as overrides.</p>}
        </section>
      )}

      {isOrganizer && audit.length > 0 && (
        <section className="card">
          <h2>Audit log</h2>
          <ul className="plain">
            {audit.map((row) => (
              <li key={row.id}>
                <span>{row.action}</span>
                <span className="muted">{formatClock(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
