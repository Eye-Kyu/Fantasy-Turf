/**
 * Partnerships and season awards, computed on demand from events and gameweek points.
 * Awards are provisional until the gameweeks they include are locked.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbExecutor } from "@/db/client";
import { gameweeks, matchEvents, matches, players } from "@/db/schema";
import { leaders, longestStreak, monthKey } from "@/lib/awards";
import { getGameweekPoints } from "./points";

export interface Partnership {
  scorerId: string;
  scorerName: string;
  assisterId: string;
  assisterName: string;
  goals: number;
}

/** Goal-assist pairs, most goals first. Voided events never count. Optionally for one season and/or one player. */
export async function getPartnerships(
  db: DbExecutor,
  filter: { seasonId?: string; playerId?: string; limit?: number } = {},
): Promise<Partnership[]> {
  const goal = alias(matchEvents, "goal");
  const scorer = alias(players, "scorer");
  const assister = alias(players, "assister");
  const conditions = [
    eq(matchEvents.type, "ASSIST"),
    isNull(matchEvents.voidedAt),
    isNull(goal.voidedAt),
    ...(filter.seasonId ? [eq(gameweeks.seasonId, filter.seasonId)] : []),
    ...(filter.playerId ? [sql`(${goal.playerId} = ${filter.playerId} OR ${matchEvents.playerId} = ${filter.playerId})`] : []),
  ];
  const count = sql<number>`count(*)::int`;
  const rows = await db
    .select({
      scorerId: goal.playerId, scorerName: scorer.displayName,
      assisterId: matchEvents.playerId, assisterName: assister.displayName,
      goals: count,
    })
    .from(matchEvents)
    .innerJoin(goal, eq(goal.id, matchEvents.relatedEventId))
    .innerJoin(matches, eq(matches.id, matchEvents.matchId))
    .innerJoin(gameweeks, eq(gameweeks.id, matches.gameweekId))
    .innerJoin(scorer, eq(scorer.id, goal.playerId))
    .innerJoin(assister, eq(assister.id, matchEvents.playerId))
    .where(and(...conditions))
    .groupBy(goal.playerId, scorer.displayName, matchEvents.playerId, assister.displayName)
    .orderBy(sql`${count} desc`, asc(scorer.displayName), asc(assister.displayName))
    .limit(filter.limit ?? 10);
  return rows;
}

export interface SeasonAwards {
  /** True only when every gameweek counted has locked. */
  final: boolean;
  goldenBoot: { value: number; names: string[] } | null;
  topAssister: { value: number; names: string[] } | null;
  bestPartnership: { goals: number; pairs: string[] } | null;
  longestStreak: { value: number; names: string[] } | null;
  playerOfTheMonth: { month: string; points: number; names: string[] } | null;
}

export async function getSeasonAwards(db: DbExecutor, seasonId: string): Promise<SeasonAwards> {
  const played = await db
    .selectDistinct({ id: gameweeks.id, number: gameweeks.number, kickoffAt: gameweeks.kickoffAt, lockedAt: gameweeks.lockedAt })
    .from(gameweeks)
    .innerJoin(matches, eq(matches.gameweekId, gameweeks.id))
    .where(eq(gameweeks.seasonId, seasonId))
    .orderBy(asc(gameweeks.number));

  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const names = new Map<string, string>();
  const playedFlags = new Map<string, boolean[]>();
  const monthly = new Map<string, Map<string, number>>();

  const perGameweek = [];
  for (const gameweek of played) {
    const { rows } = await getGameweekPoints(db, gameweek.id);
    perGameweek.push({ gameweek, byId: new Map(rows.map((r) => [r.playerId, r])) });
    for (const row of rows) {
      names.set(row.playerId, row.displayName);
      goals.set(row.playerId, (goals.get(row.playerId) ?? 0) + row.goals);
      assists.set(row.playerId, (assists.get(row.playerId) ?? 0) + row.assists);
      const month = monthKey(gameweek.kickoffAt);
      const totals = monthly.get(month) ?? new Map<string, number>();
      totals.set(row.playerId, (totals.get(row.playerId) ?? 0) + row.total);
      monthly.set(month, totals);
    }
  }
  // Streaks run over every played gameweek in order, so a miss breaks them.
  for (const playerId of names.keys()) {
    playedFlags.set(playerId, perGameweek.map(({ byId }) => (byId.get(playerId)?.matchesPlayed ?? 0) > 0));
  }

  const nameOf = (id: string) => names.get(id) ?? "Unknown player";
  const byValue = (map: Map<string, number>) => leaders([...map], ([, v]) => v);
  const boot = byValue(goals);
  const assister = byValue(assists);
  const streak = leaders([...playedFlags], ([, flags]) => longestStreak(flags));
  const pairs = await getPartnerships(db, { seasonId, limit: 50 });
  const topPairs = leaders(pairs, (p) => p.goals);

  const latestMonth = [...monthly.keys()].sort().at(-1);
  const monthLeaders = latestMonth ? byValue(monthly.get(latestMonth)!) : null;

  return {
    final: played.length > 0 && played.every((g) => g.lockedAt !== null),
    goldenBoot: boot && { value: boot.value, names: boot.items.map(([id]) => nameOf(id)) },
    topAssister: assister && { value: assister.value, names: assister.items.map(([id]) => nameOf(id)) },
    bestPartnership: topPairs && { goals: topPairs.value, pairs: topPairs.items.map((p) => `${p.assisterName} → ${p.scorerName}`) },
    longestStreak: streak && { value: streak.value, names: streak.items.map(([id]) => nameOf(id)) },
    playerOfTheMonth: monthLeaders && latestMonth ? { month: latestMonth, points: monthLeaders.value, names: monthLeaders.items.map(([id]) => nameOf(id)) } : null,
  };
}
