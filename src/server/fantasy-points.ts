/**
 * Fantasy points, computed on demand from frozen lineups and the real gameweek points.
 * Only gameweeks that have locked count toward the standings, so numbers never move
 * once published; the latest unlocked gameweek is shown separately as provisional.
 */
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { fantasyLineupPlayers, fantasyLineups, fantasySquads, gameweeks, players, users } from "@/db/schema";
import { scoreLineup, type LineupMember, type LineupPlayerScore, type PlayerForm } from "@/lib/fantasy";
import { freezeLineups } from "./fantasy";
import { getGameweekPoints } from "./points";

async function formsFor(db: DbExecutor, gameweekId: string): Promise<Map<string, PlayerForm>> {
  const { rows } = await getGameweekPoints(db, gameweekId);
  return new Map(rows.map((r) => [r.playerId, { total: r.total, finePoints: r.finePoints + r.dropoutPoints, played: r.matchesPlayed > 0 }]));
}

async function lineupMembers(db: DbExecutor, lineupId: string): Promise<LineupMember[]> {
  return db
    .select({
      playerId: fantasyLineupPlayers.playerId,
      slot: fantasyLineupPlayers.slot,
      benchOrder: fantasyLineupPlayers.benchOrder,
      isCaptain: fantasyLineupPlayers.isCaptain,
    })
    .from(fantasyLineupPlayers)
    .where(eq(fantasyLineupPlayers.lineupId, lineupId));
}

export interface SquadGameweekScore {
  gameweekId: string;
  gameweekName: string;
  final: boolean;
  total: number;
  players: (LineupPlayerScore & { displayName: string })[];
}

/** One squad's score for each gameweek it has a lineup for, oldest first. */
export async function getSquadScores(db: DbExecutor, squadId: string): Promise<SquadGameweekScore[]> {
  const lineups = await db
    .select({ id: fantasyLineups.id, gameweekId: gameweeks.id, number: gameweeks.number, lockedAt: gameweeks.lockedAt })
    .from(fantasyLineups)
    .innerJoin(gameweeks, eq(gameweeks.id, fantasyLineups.gameweekId))
    .where(eq(fantasyLineups.squadId, squadId))
    .orderBy(asc(gameweeks.kickoffAt));
  const names = new Map((await db.select({ id: players.id, name: players.displayName }).from(players)).map((p) => [p.id, p.name]));

  const scores: SquadGameweekScore[] = [];
  for (const lineup of lineups) {
    const scored = scoreLineup(await lineupMembers(db, lineup.id), await formsFor(db, lineup.gameweekId));
    scores.push({
      gameweekId: lineup.gameweekId,
      gameweekName: `Gameweek ${lineup.number}`,
      final: lineup.lockedAt !== null,
      total: scored.total,
      players: scored.players.map((p) => ({ ...p, displayName: names.get(p.playerId) ?? "?" })),
    });
  }
  return scores;
}

export interface FantasyStanding {
  squadId: string;
  userId: string;
  manager: string;
  total: number;
  lastGameweek: number | null;
}

/** Season standings over locked gameweeks, best first. Managers are named by their player profile or email. */
export async function getFantasyLeaderboard(db: DbExecutor, seasonId: string): Promise<FantasyStanding[]> {
  const locked = await db
    .select({ id: gameweeks.id })
    .from(gameweeks)
    .where(and(eq(gameweeks.seasonId, seasonId), isNotNull(gameweeks.lockedAt)))
    .orderBy(asc(gameweeks.kickoffAt));
  for (const gameweek of locked) await freezeLineups(db, gameweek.id);

  const squads = await db
    .select({ id: fantasySquads.id, userId: fantasySquads.userId, email: users.email, displayName: players.displayName })
    .from(fantasySquads)
    .innerJoin(users, eq(users.id, fantasySquads.userId))
    .leftJoin(players, eq(players.userId, users.id))
    .where(eq(fantasySquads.seasonId, seasonId));

  const lockedIds = new Set(locked.map((g) => g.id));
  const lastId = locked.at(-1)?.id;
  const formCache = new Map<string, Map<string, PlayerForm>>();
  for (const gameweek of locked) formCache.set(gameweek.id, await formsFor(db, gameweek.id));

  const standings: FantasyStanding[] = [];
  for (const squad of squads) {
    const lineups = await db
      .select({ id: fantasyLineups.id, gameweekId: fantasyLineups.gameweekId })
      .from(fantasyLineups)
      .where(eq(fantasyLineups.squadId, squad.id));
    let total = 0;
    let lastGameweek: number | null = null;
    for (const lineup of lineups) {
      if (!lockedIds.has(lineup.gameweekId)) continue;
      const points = scoreLineup(await lineupMembers(db, lineup.id), formCache.get(lineup.gameweekId)!).total;
      total += points;
      if (lineup.gameweekId === lastId) lastGameweek = points;
    }
    standings.push({ squadId: squad.id, userId: squad.userId, manager: squad.displayName ?? squad.email, total, lastGameweek });
  }
  return standings.sort((a, b) => b.total - a.total || a.manager.localeCompare(b.manager));
}
