/**
 * Pure rules for a match's event log, shared by the server and the offline scoring
 * screen so both compute the score the same way.
 *
 * Scoring works offline: the phone queues operations (add / void) and applies them on
 * top of the last events it received from the server. Every event has a client-made id,
 * so replaying an operation that already reached the server changes nothing.
 */
import type { EventType } from "@/lib/domain";

export interface EventView {
  clientId: string;
  type: EventType;
  teamId: string;
  playerId: string;
  /** For an assist: the clientId of the goal it belongs to. */
  relatedClientId: string | null;
  voided: boolean;
  occurredAt: string; // ISO timestamp
}

export type ScoringOp =
  | {
      kind: "add";
      clientId: string;
      type: EventType;
      teamId: string;
      playerId: string;
      relatedClientId: string | null;
      occurredAt: string;
    }
  | { kind: "void"; clientId: string };

/** Goals per team, ignoring voided events. Every team appears, even with 0. */
export function tallyScore(events: readonly EventView[], teamIds: readonly string[]): Record<string, number> {
  const score = Object.fromEntries(teamIds.map((id) => [id, 0]));
  for (const event of events) {
    if (event.type === "GOAL" && !event.voided && event.teamId in score) score[event.teamId]! += 1;
  }
  return score;
}

/**
 * Applies queued operations to the events last seen from the server. Adding an event
 * that is already present, or voiding one that is already void, is a no-op. Voiding a
 * goal also voids its assist, so an assist never outlives its goal.
 */
export function applyOps(base: readonly EventView[], ops: readonly ScoringOp[]): EventView[] {
  const events = base.map((event) => ({ ...event }));
  for (const op of ops) {
    if (op.kind === "add") {
      if (events.some((event) => event.clientId === op.clientId)) continue;
      const { kind: _kind, ...event } = op;
      events.push({ ...event, voided: false });
    } else {
      for (const event of events) {
        if (event.clientId === op.clientId || event.relatedClientId === op.clientId) event.voided = true;
      }
    }
  }
  return events;
}

/** The most recent event that has not been voided: the one "Undo" removes. */
export function lastUndoable(events: readonly EventView[]): EventView | null {
  const live = events.filter((event) => !event.voided);
  return live.reduce<EventView | null>(
    (latest, event) => (latest === null || event.occurredAt >= latest.occurredAt ? event : latest),
    null,
  );
}

/**
 * Combines two views of the same match's events (e.g. an older cached page and the last
 * response from the server). Events are only ever added or voided, never un-voided, so
 * the union with "voided if either says so" is always the newer truth.
 */
export function mergeEvents(a: readonly EventView[], b: readonly EventView[]): EventView[] {
  const byId = new Map<string, EventView>();
  for (const event of [...a, ...b]) {
    const known = byId.get(event.clientId);
    byId.set(event.clientId, known ? { ...known, voided: known.voided || event.voided } : { ...event });
  }
  return [...byId.values()].sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));
}
