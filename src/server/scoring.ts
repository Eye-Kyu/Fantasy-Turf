/**
 * Live scoring, voiding, audit logging, reconciliation and the gameweek lock.
 *
 * Integrity rules (see "Data capture and integrity" in CLAUDE.md):
 * - nobody scores or reconciles a match they play in;
 * - only the claimed live scorer (or an organizer) records events;
 * - events are voided, never deleted, and every change writes an audit row;
 * - once the gameweek is locked only organizers may change events, audited as OVERRIDE.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { eventAuditLogs, gameDayTeamPlayers, gameDayTeams, gameweeks, matchEvents, matches, players } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import type { EventType } from "@/lib/domain";
import { areTeamsLocked } from "@/lib/gameweek";
import type { EventView, ScoringOp } from "@/lib/match-events";
import { type Actor, assertCan } from "./actor";
import { NotFoundError, ScoringError } from "./errors";
import { settleGameweekBets } from "./betting";
import { applyGameweekRatings } from "./ratings";

type AuditAction = "CREATE" | "VOID" | "EDIT" | "OVERRIDE";

async function loadContext(db: DbExecutor, matchId: string) {
  const [row] = await db
    .select({ match: matches, gameweek: gameweeks })
    .from(matches)
    .innerJoin(gameweeks, eq(gameweeks.id, matches.gameweekId))
    .where(eq(matches.id, matchId));
  if (!row) throw new NotFoundError("Match");

  const members = await db
    .select({ playerId: gameDayTeamPlayers.playerId, teamId: gameDayTeamPlayers.gameDayTeamId, userId: players.userId })
    .from(gameDayTeamPlayers)
    .innerJoin(players, eq(players.id, gameDayTeamPlayers.playerId))
    .where(eq(gameDayTeamPlayers.matchId, matchId));
  return {
    ...row,
    teamOfPlayer: new Map(members.map((m) => [m.playerId, m.teamId])),
    userIdsPlaying: new Set(members.flatMap((m) => (m.userId ? [m.userId] : []))),
  };
}
type Context = Awaited<ReturnType<typeof loadContext>>;

/** Throws unless the actor may score this match right now. Returns whether it is an override. */
function assertCanScore(ctx: Context, actor: Actor, now: Date): { override: boolean } {
  if (!areTeamsLocked(ctx.gameweek.kickoffAt, now)) {
    throw new ScoringError("not-open", "Scoring opens when teams lock, 3 hours before kick-off");
  }
  if (ctx.userIdsPlaying.has(actor.userId)) throw new ScoringError("playing", "You play in this match");

  const isOrganizer = can(actor.role, "reconcileMatches");
  if (ctx.gameweek.lockedAt) {
    if (!isOrganizer) throw new ScoringError("locked", "This gameweek is locked");
    return { override: true };
  }
  if (ctx.match.liveScorerId !== actor.userId && !isOrganizer) {
    throw new ScoringError("not-scorer", "You are not the live scorer for this match");
  }
  return { override: false };
}

async function audit(
  db: DbExecutor,
  eventId: string,
  actorId: string,
  action: AuditAction,
  override: boolean,
  before: unknown,
  after: unknown,
) {
  await db
    .insert(eventAuditLogs)
    .values({ eventId, actorId, action: override ? "OVERRIDE" : action, before: before ?? null, after: after ?? null });
}

/** A change to a reconciled (but unlocked) match must be reviewed again. */
async function reopenReconciliation(db: DbExecutor, ctx: Context) {
  if (ctx.match.reconciledAt && !ctx.gameweek.lockedAt) {
    await db.update(matches).set({ reconciledAt: null, reconciledById: null }).where(eq(matches.id, ctx.match.id));
  }
}

/** Becomes the live scorer. Organizers may take over from someone else. */
export async function claimScoring(db: DbExecutor, actor: Actor, matchId: string, now = new Date()) {
  const ctx = await loadContext(db, matchId);
  if (!areTeamsLocked(ctx.gameweek.kickoffAt, now)) throw new ScoringError("not-open", "Scoring opens when teams lock");
  if (ctx.userIdsPlaying.has(actor.userId)) throw new ScoringError("playing", "You play in this match");
  if (ctx.match.liveScorerId && ctx.match.liveScorerId !== actor.userId && !can(actor.role, "reconcileMatches")) {
    throw new ScoringError("scorer-taken", "Someone else is already scoring this match");
  }
  await db.update(matches).set({ liveScorerId: actor.userId }).where(eq(matches.id, matchId));
}

export async function releaseScoring(db: DbExecutor, actor: Actor, matchId: string) {
  const ctx = await loadContext(db, matchId);
  if (ctx.match.liveScorerId !== actor.userId && !can(actor.role, "reconcileMatches")) {
    throw new ScoringError("not-scorer", "You are not the live scorer for this match");
  }
  await db.update(matches).set({ liveScorerId: null }).where(eq(matches.id, matchId));
}

async function findEvent(db: DbExecutor, matchId: string, clientId: string) {
  const [event] = await db
    .select()
    .from(matchEvents)
    .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.clientId, clientId)));
  return event;
}

/**
 * Records one event. Safe to retry: an event whose clientId is already stored is
 * ignored, so a flaky connection cannot double-count a goal.
 */
async function recordEventUnit(
  db: DbExecutor,
  actor: Actor,
  input: {
    matchId: string;
    clientId: string;
    type: EventType;
    playerId: string;
    relatedClientId: string | null;
    occurredAt: Date;
  },
  now = new Date(),
): Promise<void> {
  const ctx = await loadContext(db, input.matchId);
  const { override } = assertCanScore(ctx, actor, now);

  if (await findEvent(db, input.matchId, input.clientId)) return;

  const teamId = ctx.teamOfPlayer.get(input.playerId);
  if (!teamId) throw new ScoringError("invalid-event", "That player is not on a team in this match");

  let relatedEventId: string | null = null;
  if (input.type === "ASSIST") {
    const goal = input.relatedClientId ? await findEvent(db, input.matchId, input.relatedClientId) : undefined;
    if (!goal || goal.type !== "GOAL" || goal.voidedAt) throw new ScoringError("invalid-event", "An assist needs a goal");
    if (goal.gameDayTeamId !== teamId) throw new ScoringError("invalid-event", "The assist must come from the scorer's team");
    if (goal.playerId === input.playerId) throw new ScoringError("invalid-event", "A player cannot assist their own goal");
    const [existing] = await db
      .select({ id: matchEvents.id })
      .from(matchEvents)
      .where(and(eq(matchEvents.relatedEventId, goal.id), eq(matchEvents.type, "ASSIST"), sql`${matchEvents.voidedAt} IS NULL`));
    if (existing) throw new ScoringError("invalid-event", "That goal already has an assist");
    relatedEventId = goal.id;
  } else if (input.relatedClientId) {
    throw new ScoringError("invalid-event", "Only an assist links to a goal");
  }

  const occurredAt = input.occurredAt > now ? now : input.occurredAt; // a phone clock can run fast
  const [event] = await db
    .insert(matchEvents)
    .values({
      clientId: input.clientId,
      matchId: input.matchId,
      gameDayTeamId: teamId,
      playerId: input.playerId,
      type: input.type,
      relatedEventId,
      occurredAt,
    })
    .returning();
  await audit(db, event!.id, actor.userId, "CREATE", override, null, { type: event!.type, playerId: event!.playerId, teamId });
  await reopenReconciliation(db, ctx);
}

/** Voids an event (and, for a goal, its assist). Voiding twice is harmless. */
async function voidEventUnit(
  db: DbExecutor,
  actor: Actor,
  input: { matchId: string; clientId: string },
  now = new Date(),
): Promise<void> {
  const ctx = await loadContext(db, input.matchId);
  const { override } = assertCanScore(ctx, actor, now);

  const event = await findEvent(db, input.matchId, input.clientId);
  if (!event) throw new ScoringError("invalid-event", "No such event");

  const targets = await db
    .select()
    .from(matchEvents)
    .where(sql`(${matchEvents.id} = ${event.id} OR ${matchEvents.relatedEventId} = ${event.id}) AND ${matchEvents.voidedAt} IS NULL`);
  for (const target of targets) {
    await db.update(matchEvents).set({ voidedAt: now }).where(eq(matchEvents.id, target.id));
    await audit(db, target.id, actor.userId, "VOID", override, { voided: false }, { voided: true });
  }
  if (targets.length > 0) await reopenReconciliation(db, ctx);
}

/**
 * Corrects who an event belongs to (reconciliation). Organizers only; the new player
 * must be on the same team, so the score never changes by accident.
 */
async function changeEventPlayerUnit(
  db: DbExecutor,
  actor: Actor,
  input: { matchId: string; clientId: string; playerId: string },
  now = new Date(),
): Promise<void> {
  assertCan(actor, "reconcileMatches");
  const ctx = await loadContext(db, input.matchId);
  const { override } = assertCanScore(ctx, actor, now);

  const event = await findEvent(db, input.matchId, input.clientId);
  if (!event || event.voidedAt) throw new ScoringError("invalid-event", "No such event");
  if (ctx.teamOfPlayer.get(input.playerId) !== event.gameDayTeamId) {
    throw new ScoringError("invalid-event", "Pick a player from the same team");
  }
  if (event.type === "ASSIST" && event.relatedEventId) {
    const [goal] = await db.select({ playerId: matchEvents.playerId }).from(matchEvents).where(eq(matchEvents.id, event.relatedEventId));
    if (goal?.playerId === input.playerId) throw new ScoringError("invalid-event", "A player cannot assist their own goal");
  }
  if (event.type === "GOAL") {
    const [assist] = await db
      .select({ playerId: matchEvents.playerId })
      .from(matchEvents)
      .where(and(eq(matchEvents.relatedEventId, event.id), sql`${matchEvents.voidedAt} IS NULL`));
    if (assist?.playerId === input.playerId) throw new ScoringError("invalid-event", "The scorer cannot also be the assist");
  }

  await db.update(matchEvents).set({ playerId: input.playerId }).where(eq(matchEvents.id, event.id));
  await audit(db, event.id, actor.userId, "EDIT", override, { playerId: event.playerId }, { playerId: input.playerId });
  await reopenReconciliation(db, ctx);
}

// The public versions run inside one transaction so an event and its audit row are
// stored together or not at all.
type RecordInput = Parameters<typeof recordEventUnit>[2];
type VoidInput = Parameters<typeof voidEventUnit>[2];
type ChangePlayerInput = Parameters<typeof changeEventPlayerUnit>[2];

export function recordEvent(db: DbExecutor, actor: Actor, input: RecordInput, now = new Date()): Promise<void> {
  return db.transaction((tx) => recordEventUnit(tx, actor, input, now));
}

export function voidEvent(db: DbExecutor, actor: Actor, input: VoidInput, now = new Date()): Promise<void> {
  return db.transaction((tx) => voidEventUnit(tx, actor, input, now));
}

export function changeEventPlayer(db: DbExecutor, actor: Actor, input: ChangePlayerInput, now = new Date()): Promise<void> {
  return db.transaction((tx) => changeEventPlayerUnit(tx, actor, input, now));
}

export interface OpResult {
  clientId: string;
  /** "ok" also covers an operation that had already been applied. */
  status: "ok" | "rejected";
  message?: string;
}

/**
 * Applies a phone's queued operations in order. Each is independent: a rejected one is
 * reported (the phone shows why and drops it) and the rest still go through.
 */
export async function applyScoringOps(
  db: DbExecutor,
  actor: Actor,
  matchId: string,
  ops: readonly ScoringOp[],
  now = new Date(),
): Promise<OpResult[]> {
  const results: OpResult[] = [];
  for (const op of ops) {
    try {
      if (op.kind === "add") {
        await recordEvent(
          db,
          actor,
          { matchId, clientId: op.clientId, type: op.type, playerId: op.playerId, relatedClientId: op.relatedClientId, occurredAt: new Date(op.occurredAt) },
          now,
        );
      } else {
        await voidEvent(db, actor, { matchId, clientId: op.clientId }, now);
      }
      results.push({ clientId: op.clientId, status: "ok" });
    } catch (error) {
      if (error instanceof ScoringError || error instanceof NotFoundError) {
        results.push({ clientId: op.clientId, status: "rejected", message: error.message });
      } else {
        throw error;
      }
    }
  }
  return results;
}

/** Marks the match as reviewed against the live log. Organizers who are not playing in it. */
export async function reconcileMatch(db: DbExecutor, actor: Actor, matchId: string, now = new Date()) {
  assertCan(actor, "reconcileMatches");
  const ctx = await loadContext(db, matchId);
  if (ctx.userIdsPlaying.has(actor.userId)) throw new ScoringError("playing", "You play in this match");
  if (!areTeamsLocked(ctx.gameweek.kickoffAt, now)) throw new ScoringError("not-open", "The match has not been played yet");
  if (ctx.gameweek.lockedAt) throw new ScoringError("locked", "This gameweek is already locked");
  await db.update(matches).set({ reconciledById: actor.userId, reconciledAt: now }).where(eq(matches.id, matchId));
}

/** Locks the gameweek once every match is reconciled, then updates ratings. Later changes become audited overrides. */
export async function lockGameweek(db: DbExecutor, actor: Actor, gameweekId: string, now = new Date()) {
  assertCan(actor, "reconcileMatches");
  const [gameweek] = await db.select().from(gameweeks).where(eq(gameweeks.id, gameweekId));
  if (!gameweek) throw new NotFoundError("Gameweek");

  const rows = await db.select({ reconciledAt: matches.reconciledAt }).from(matches).where(eq(matches.gameweekId, gameweekId));
  if (rows.length === 0 || rows.some((row) => !row.reconciledAt)) {
    throw new ScoringError("not-reconciled", "Every match must be reconciled before the gameweek can be locked");
  }
  await db.transaction(async (tx) => {
    const locked = await tx
      .update(gameweeks)
      .set({ lockedAt: now })
      .where(and(eq(gameweeks.id, gameweekId), sql`${gameweeks.lockedAt} IS NULL`))
      .returning({ id: gameweeks.id });
    // Ratings and prices move once, at the moment the gameweek becomes final.
    if (locked.length > 0) {
      await applyGameweekRatings(tx, gameweekId);
      await settleGameweekBets(tx, gameweekId);
    }
  });
}

/** Everything a match page needs. */
export async function getMatchView(db: DbExecutor, matchId: string) {
  const ctx = await loadContext(db, matchId);
  const teams = await db
    .select({ id: gameDayTeams.id, name: gameDayTeams.name })
    .from(gameDayTeams)
    .where(eq(gameDayTeams.matchId, matchId))
    .orderBy(asc(gameDayTeams.name));
  const members = await db
    .select({ teamId: gameDayTeamPlayers.gameDayTeamId, playerId: players.id, displayName: players.displayName })
    .from(gameDayTeamPlayers)
    .innerJoin(players, eq(players.id, gameDayTeamPlayers.playerId))
    .where(eq(gameDayTeamPlayers.matchId, matchId))
    .orderBy(asc(players.displayName));
  const rows = await db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.occurredAt), asc(matchEvents.createdAt));

  const clientIdOf = new Map(rows.map((row) => [row.id, row.clientId]));
  const events: EventView[] = rows.map((row) => ({
    clientId: row.clientId,
    type: row.type,
    teamId: row.gameDayTeamId,
    playerId: row.playerId,
    relatedClientId: row.relatedEventId ? (clientIdOf.get(row.relatedEventId) ?? null) : null,
    voided: row.voidedAt !== null,
    occurredAt: row.occurredAt.toISOString(),
  }));

  return {
    match: ctx.match,
    gameweek: ctx.gameweek,
    teams: teams.map((team) => ({ ...team, players: members.filter((m) => m.teamId === team.id) })),
    events,
    userIdsPlaying: ctx.userIdsPlaying,
  };
}

/** Audit trail for a match, newest first. */
export async function listMatchAudit(db: DbExecutor, matchId: string) {
  const ids = db.select({ id: matchEvents.id }).from(matchEvents).where(eq(matchEvents.matchId, matchId));
  return db
    .select()
    .from(eventAuditLogs)
    .where(inArray(eventAuditLogs.eventId, ids))
    .orderBy(sql`${eventAuditLogs.createdAt} DESC`);
}
