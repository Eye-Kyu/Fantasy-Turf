/**
 * Turns recorded matches into player points, using the pure rules in lib/scoring.
 * Nothing is stored: points are computed from events, attendance and fines each time,
 * so a reconciliation fix or a voided fine shows up immediately. (Volume is a few
 * dozen events a week; cache at gameweek lock if this ever gets slow.)
 */
import { asc, eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { attendances, fines, gameDayTeamPlayers, gameweeks, matchEvents, matches, players } from "@/db/schema";
import { BONUS_POINTS } from "@/lib/constants";
import { applyFines } from "@/lib/scoring/fines";
import { type PlayerMatchBreakdown, type ScoringEvent, breakdownMatch } from "@/lib/scoring/engine";

export interface PlayerGameweekPoints {
  playerId: string;
  displayName: string;
  matchesPlayed: number;
  goals: number;
  assists: number;
  saves: number;
  keyTackles: number;
  eventPoints: number;
  bonusPoints: number;
  /** Points deducted by fines, as a positive number. */
  finePoints: number;
  /** Points lost for being put on a team and then not playing (positive); counted once the match is reconciled. */
  dropoutPoints: number;
  total: number;
}

export interface GameweekPoints {
  /** True once the gameweek is locked; before that the numbers can still change. */
  final: boolean;
  rows: PlayerGameweekPoints[];
}

const emptyRow = (playerId: string, displayName: string): PlayerGameweekPoints => ({
  playerId, displayName, matchesPlayed: 0, goals: 0, assists: 0, saves: 0, keyTackles: 0,
  eventPoints: 0, bonusPoints: 0, finePoints: 0, dropoutPoints: 0, total: 0,
});

/**
 * Points for every player involved in a gameweek, best first.
 *
 * A player counts as having played a match if the organizer marked them attended, or
 * if they have an event in it (recording a goal proves they were there). Team bonuses
 * therefore reach everyone who played, but a no-show on a team gets nothing.
 */
export async function getGameweekPoints(db: DbExecutor, gameweekId: string): Promise<GameweekPoints> {
  const [gameweek] = await db.select({ lockedAt: gameweeks.lockedAt }).from(gameweeks).where(eq(gameweeks.id, gameweekId));
  const final = Boolean(gameweek?.lockedAt);

  const matchRows = await db.select({ id: matches.id, reconciledAt: matches.reconciledAt, motmPlayerId: matches.motmPlayerId }).from(matches).where(eq(matches.gameweekId, gameweekId));
  const members = await db
    .select({ matchId: gameDayTeamPlayers.matchId, playerId: gameDayTeamPlayers.playerId, teamId: gameDayTeamPlayers.gameDayTeamId })
    .from(gameDayTeamPlayers)
    .innerJoin(matches, eq(matches.id, gameDayTeamPlayers.matchId))
    .where(eq(matches.gameweekId, gameweekId));
  const eventRows = await db
    .select({
      id: matchEvents.id, matchId: matchEvents.matchId, type: matchEvents.type, playerId: matchEvents.playerId,
      gameDayTeamId: matchEvents.gameDayTeamId, occurredAt: matchEvents.occurredAt, voidedAt: matchEvents.voidedAt,
    })
    .from(matchEvents)
    .innerJoin(matches, eq(matches.id, matchEvents.matchId))
    .where(eq(matches.gameweekId, gameweekId));
  const attended = new Set(
    (await db.select({ playerId: attendances.playerId, attended: attendances.attended }).from(attendances).where(eq(attendances.gameweekId, gameweekId)))
      .filter((a) => a.attended)
      .map((a) => a.playerId),
  );
  const fineRows = await db
    .select({ playerId: fines.playerId, points: fines.points, voidedAt: fines.voidedAt })
    .from(fines)
    .where(eq(fines.gameweekId, gameweekId));

  const rowsById = new Map<string, PlayerGameweekPoints>();
  const matchIds = new Set(members.map((m) => m.matchId));
  for (const matchId of matchIds) {
    const events: ScoringEvent[] = eventRows.filter((e) => e.matchId === matchId);
    const withEvents = new Set(events.filter((e) => e.voidedAt === null).map((e) => e.playerId));
    const roster = members
      .filter((m) => m.matchId === matchId && (attended.has(m.playerId) || withEvents.has(m.playerId)))
      .map((m) => ({ playerId: m.playerId, gameDayTeamId: m.teamId }));
    const teamIds = [...new Set(members.filter((m) => m.matchId === matchId).map((m) => m.teamId))];
    const matchInfo = matchRows.find((m) => m.id === matchId);
    const playedHere = new Set(roster.map((r) => r.playerId));
    // A reconciled match is final enough to say who never showed up.
    if (matchInfo?.reconciledAt) {
      for (const m of members.filter((x) => x.matchId === matchId && !playedHere.has(x.playerId))) {
        const row = rowsById.get(m.playerId) ?? emptyRow(m.playerId, "");
        row.dropoutPoints += -BONUS_POINTS.LATE_DROPOUT;
        rowsById.set(m.playerId, row);
      }
    }

    for (const [playerId, b] of breakdownMatch(events, roster, teamIds) as Map<string, PlayerMatchBreakdown>) {
      const row = rowsById.get(playerId) ?? emptyRow(playerId, "");
      row.matchesPlayed += 1;
      row.goals += b.goals;
      row.assists += b.assists;
      row.saves += b.saves;
      row.keyTackles += b.keyTackles;
      row.eventPoints += b.eventPoints;
      row.bonusPoints += b.bonusPoints;
      if (matchInfo?.motmPlayerId === playerId) row.bonusPoints += BONUS_POINTS.MAN_OF_THE_MATCH;
      rowsById.set(playerId, row);
    }
  }

  // Fines apply even to players with no row yet (e.g. a no-show after confirming).
  const beforeFines = new Map([...rowsById].map(([id, row]) => [id, row.eventPoints + row.bonusPoints]));
  const totals = applyFines(beforeFines, fineRows);
  for (const fine of fineRows) {
    if (fine.voidedAt === null && !rowsById.has(fine.playerId)) rowsById.set(fine.playerId, emptyRow(fine.playerId, ""));
  }
  for (const fine of fineRows) {
    if (fine.voidedAt === null) rowsById.get(fine.playerId)!.finePoints += fine.points;
  }

  const names = new Map((await db.select({ id: players.id, name: players.displayName }).from(players)).map((p) => [p.id, p.name]));
  const rows = [...rowsById.values()].map((row) => ({
    ...row,
    displayName: names.get(row.playerId) ?? "Unknown player",
    total: (totals.get(row.playerId) ?? 0) - row.dropoutPoints,
  }));
  rows.sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
  return { final, rows };
}

/** Every gameweek of a season that has at least one match, oldest first. */
async function playedGameweekIds(db: DbExecutor, seasonId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: gameweeks.id, number: gameweeks.number })
    .from(gameweeks)
    .innerJoin(matches, eq(matches.gameweekId, gameweeks.id))
    .where(eq(gameweeks.seasonId, seasonId))
    .orderBy(asc(gameweeks.number));
  return rows.map((r) => r.id);
}

/** Season totals per player (sum of gameweek rows), best first. */
export async function getSeasonTotals(db: DbExecutor, seasonId: string): Promise<PlayerGameweekPoints[]> {
  const totals = new Map<string, PlayerGameweekPoints>();
  for (const gameweekId of await playedGameweekIds(db, seasonId)) {
    for (const row of (await getGameweekPoints(db, gameweekId)).rows) {
      const sum = totals.get(row.playerId) ?? emptyRow(row.playerId, row.displayName);
      for (const key of ["matchesPlayed", "goals", "assists", "saves", "keyTackles", "eventPoints", "bonusPoints", "finePoints", "dropoutPoints", "total"] as const) {
        sum[key] += row[key];
      }
      totals.set(row.playerId, sum);
    }
  }
  return [...totals.values()].sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
}
