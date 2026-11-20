/**
 * Virtual-points betting on a match: winner, top scorer or top assister. Bets are open
 * from the team lock (teams are known) until kick-off, and settle when the gameweek
 * locks. You can't bet on a match you play in or score. See lib/betting.ts for payouts.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { bets, gameDayTeamPlayers, gameDayTeams, gameweeks, matchEvents, matches, players, users } from "@/db/schema";
import { BETTING } from "@/lib/constants";
import { areTeamsLocked } from "@/lib/gameweek";
import { settlePool, walletBalance, type PoolBet } from "@/lib/betting";
import type { Actor } from "./actor";
import { isUniqueViolation } from "./db-errors";
import { BettingError, NotFoundError } from "./errors";

export type BetType = "TOP_SCORER" | "TOP_ASSISTS" | "MATCH_WINNER";

/** A user's points in a season: allowance only for gameweeks that locked after they joined. */
export async function getBalance(db: DbExecutor, userId: string, seasonId: string): Promise<number> {
  const [user] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId));
  if (!user) throw new NotFoundError("User");
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gameweeks)
    .where(and(eq(gameweeks.seasonId, seasonId), isNotNull(gameweeks.lockedAt), gte(gameweeks.kickoffAt, user.createdAt)))) as [{ count: number }];
  const mine = await db
    .select({ stake: bets.stake, payout: bets.payout })
    .from(bets)
    .innerJoin(gameweeks, eq(gameweeks.id, bets.gameweekId))
    .where(and(eq(bets.userId, userId), eq(gameweeks.seasonId, seasonId)));
  return walletBalance({ lockedGameweeks: count, bets: mine });
}

export function isBettingOpen(gameweek: { kickoffAt: Date; lockedAt: Date | null }, now: Date): boolean {
  return gameweek.lockedAt === null && areTeamsLocked(gameweek.kickoffAt, now) && now < gameweek.kickoffAt;
}

export async function placeBet(
  db: DbExecutor,
  actor: Actor,
  input: { matchId: string; type: BetType; pickId: string; stake: number },
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ match: matches, gameweek: gameweeks })
      .from(matches)
      .innerJoin(gameweeks, eq(gameweeks.id, matches.gameweekId))
      .where(eq(matches.id, input.matchId));
    if (!row) throw new NotFoundError("Match");
    if (!isBettingOpen(row.gameweek, now)) throw new BettingError("closed", "Bets are open from the team lock until kick-off");

    if (!Number.isInteger(input.stake) || input.stake < BETTING.MIN_STAKE || input.stake > BETTING.MAX_STAKE) {
      throw new BettingError("stake", `Stakes are ${BETTING.MIN_STAKE} to ${BETTING.MAX_STAKE} points`);
    }

    const members = await tx
      .select({ playerId: gameDayTeamPlayers.playerId, teamId: gameDayTeamPlayers.gameDayTeamId, userId: players.userId })
      .from(gameDayTeamPlayers)
      .innerJoin(players, eq(players.id, gameDayTeamPlayers.playerId))
      .where(eq(gameDayTeamPlayers.matchId, input.matchId));
    if (row.match.liveScorerId === actor.userId || members.some((m) => m.userId === actor.userId)) {
      throw new BettingError("own-match", "You can't bet on a match you play in or score");
    }

    const isWinnerBet = input.type === "MATCH_WINNER";
    const validPick = isWinnerBet
      ? (await tx.select({ id: gameDayTeams.id }).from(gameDayTeams).where(and(eq(gameDayTeams.id, input.pickId), eq(gameDayTeams.matchId, input.matchId)))).length > 0
      : members.some((m) => m.playerId === input.pickId);
    if (!validPick) throw new BettingError("invalid-pick", "That pick isn't in this match");

    if ((await getBalance(tx, actor.userId, row.gameweek.seasonId)) < input.stake) {
      throw new BettingError("balance", "Not enough points");
    }
    try {
      await tx.transaction((inner) =>
        inner.insert(bets).values({
          userId: actor.userId,
          gameweekId: row.gameweek.id,
          matchId: input.matchId,
          type: input.type,
          stake: input.stake,
          targetTeamId: isWinnerBet ? input.pickId : null,
          targetPlayerId: isWinnerBet ? null : input.pickId,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new BettingError("duplicate", "You already have this kind of bet on this match");
      throw error;
    }
  });
}

/** The winning picks for each bet type in one match (empty set = no result, refund). */
async function winningPicks(db: DbExecutor, matchId: string): Promise<Record<BetType, Set<string>>> {
  const events = await db
    .select({ type: matchEvents.type, playerId: matchEvents.playerId, teamId: matchEvents.gameDayTeamId })
    .from(matchEvents)
    .where(and(eq(matchEvents.matchId, matchId), isNull(matchEvents.voidedAt)));

  const top = (type: "GOAL" | "ASSIST") => {
    const counts = new Map<string, number>();
    for (const e of events) if (e.type === type) counts.set(e.playerId, (counts.get(e.playerId) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    return new Set(best > 0 ? [...counts].filter(([, n]) => n === best).map(([id]) => id) : []);
  };

  const goalsByTeam = new Map<string, number>();
  for (const e of events) if (e.type === "GOAL") goalsByTeam.set(e.teamId, (goalsByTeam.get(e.teamId) ?? 0) + 1);
  const teams = await db.select({ id: gameDayTeams.id }).from(gameDayTeams).where(eq(gameDayTeams.matchId, matchId));
  const scores = teams.map((t) => ({ id: t.id, goals: goalsByTeam.get(t.id) ?? 0 }));
  const bestGoals = Math.max(0, ...scores.map((s) => s.goals));
  const leaders = scores.filter((s) => s.goals === bestGoals);
  const winner = leaders.length === 1 ? new Set([leaders[0]!.id]) : new Set<string>(); // a draw refunds

  return { TOP_SCORER: top("GOAL"), TOP_ASSISTS: top("ASSIST"), MATCH_WINNER: winner };
}

/** Settles every open bet of a gameweek. Safe to call twice: settled bets are skipped. */
export async function settleGameweekBets(db: DbExecutor, gameweekId: string): Promise<number> {
  const open = await db
    .select()
    .from(bets)
    .where(and(eq(bets.gameweekId, gameweekId), eq(bets.status, "OPEN")))
    .orderBy(asc(bets.createdAt));
  let settled = 0;
  for (const matchId of new Set(open.map((b) => b.matchId))) {
    const picks = await winningPicks(db, matchId);
    for (const type of ["TOP_SCORER", "TOP_ASSISTS", "MATCH_WINNER"] as const) {
      const pool: PoolBet[] = open
        .filter((b) => b.matchId === matchId && b.type === type)
        .map((b) => ({ id: b.id, stake: b.stake, pick: (type === "MATCH_WINNER" ? b.targetTeamId : b.targetPlayerId)! }));
      for (const s of settlePool(pool, picks[type])) {
        await db.update(bets).set({ status: s.status, payout: s.payout }).where(and(eq(bets.id, s.id), eq(bets.status, "OPEN")));
        settled += 1;
      }
    }
  }
  return settled;
}

export interface MatchBetOptions {
  matchId: string;
  number: number;
  teams: { id: string; name: string }[];
  players: { id: string; name: string }[];
  mine: { type: BetType; stake: number; status: string; payout: number | null; pickName: string }[];
  /** Why this user can't bet on the match, if so. */
  blocked: boolean;
}

/** Matches of a gameweek with what a user may bet on and their existing bets. */
export async function getBettingBoard(db: DbExecutor, userId: string, gameweekId: string): Promise<MatchBetOptions[]> {
  const matchRows = await db.select().from(matches).where(eq(matches.gameweekId, gameweekId)).orderBy(asc(matches.number));
  const ids = matchRows.map((m) => m.id);
  if (ids.length === 0) return [];
  const teams = await db.select({ id: gameDayTeams.id, name: gameDayTeams.name, matchId: gameDayTeams.matchId }).from(gameDayTeams).where(inArray(gameDayTeams.matchId, ids)).orderBy(asc(gameDayTeams.name));
  const members = await db
    .select({ matchId: gameDayTeamPlayers.matchId, id: players.id, name: players.displayName, userId: players.userId })
    .from(gameDayTeamPlayers)
    .innerJoin(players, eq(players.id, gameDayTeamPlayers.playerId))
    .where(inArray(gameDayTeamPlayers.matchId, ids))
    .orderBy(asc(players.displayName));
  const mine = await db.select().from(bets).where(and(eq(bets.userId, userId), eq(bets.gameweekId, gameweekId)));
  const nameOf = new Map([...teams.map((t) => [t.id, t.name] as const), ...members.map((m) => [m.id, m.name] as const)]);

  return matchRows.map((match) => ({
    matchId: match.id,
    number: match.number,
    teams: teams.filter((t) => t.matchId === match.id),
    players: members.filter((m) => m.matchId === match.id).map((m) => ({ id: m.id, name: m.name })),
    mine: mine
      .filter((b) => b.matchId === match.id)
      .map((b) => ({ type: b.type, stake: b.stake, status: b.status, payout: b.payout, pickName: nameOf.get((b.targetTeamId ?? b.targetPlayerId)!) ?? "?" })),
    blocked: match.liveScorerId === userId || members.some((m) => m.matchId === match.id && m.userId === userId),
  }));
}

/** Season standings by points, best first. */
export async function getBettingLeaderboard(db: DbExecutor, seasonId: string) {
  const everyone = await db
    .select({ userId: users.id, email: users.email, displayName: players.displayName })
    .from(users)
    .leftJoin(players, eq(players.userId, users.id));
  const rows = [];
  for (const u of everyone) rows.push({ userId: u.userId, name: u.displayName ?? u.email, balance: await getBalance(db, u.userId, seasonId) });
  return rows.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

/** Undoes the settlement of a gameweek's bets and settles them again from the current result. */
export async function resettleGameweekBets(db: DbExecutor, gameweekId: string): Promise<number> {
  await db.update(bets).set({ status: "OPEN", payout: null }).where(eq(bets.gameweekId, gameweekId));
  return settleGameweekBets(db, gameweekId);
}
