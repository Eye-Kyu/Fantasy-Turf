/**
 * Manual sorting of the players who are going into game-day teams, match by match.
 * Organizers only, and only until the lock (3 hours before kick-off). The database
 * already guarantees one team per player per match; this adds who may sort, when, and
 * that only players who RSVP'd Going are picked.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { attendances, gameDayTeamPlayers, gameDayTeams, gameweeks, matches, players } from "@/db/schema";
import { areTeamsLocked } from "@/lib/gameweek";
import { type Actor, assertCan } from "./actor";
import { NotFoundError, PlayerNotGoingError, TeamsLockedError } from "./errors";

const DEFAULT_TEAM_NAMES = ["Team A", "Team B"] as const;

/** Throws unless the actor may sort and the gameweek's teams are still open. */
function assertCanSort(actor: Actor, kickoffAt: Date, now: Date): void {
  assertCan(actor, "sortTeams");
  if (areTeamsLocked(kickoffAt, now)) throw new TeamsLockedError();
}

async function loadGameweek(db: DbExecutor, gameweekId: string) {
  const [gameweek] = await db.select().from(gameweeks).where(eq(gameweeks.id, gameweekId));
  if (!gameweek) throw new NotFoundError("Gameweek");
  return gameweek;
}

/** The match and its gameweek's kick-off, for rules that depend on the lock. */
async function loadMatch(db: DbExecutor, matchId: string) {
  const [row] = await db
    .select({ id: matches.id, gameweekId: matches.gameweekId, kickoffAt: gameweeks.kickoffAt })
    .from(matches)
    .innerJoin(gameweeks, eq(gameweeks.id, matches.gameweekId))
    .where(eq(matches.id, matchId));
  if (!row) throw new NotFoundError("Match");
  return row;
}

/** Adds the next numbered match to a gameweek, with two empty teams. */
export async function createMatch(db: DbExecutor, actor: Actor, gameweekId: string, now = new Date()) {
  const gameweek = await loadGameweek(db, gameweekId);
  assertCanSort(actor, gameweek.kickoffAt, now);

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ number: sql<number>`coalesce(max(${matches.number}), 0)::int` })
      .from(matches)
      .where(eq(matches.gameweekId, gameweekId));
    const [match] = await tx
      .insert(matches)
      .values({ gameweekId, number: latest!.number + 1 })
      .returning({ id: matches.id });
    await tx.insert(gameDayTeams).values(DEFAULT_TEAM_NAMES.map((name) => ({ matchId: match!.id, name })));
    return match!;
  });
}

export async function deleteMatch(db: DbExecutor, actor: Actor, matchId: string, now = new Date()) {
  const match = await loadMatch(db, matchId);
  assertCanSort(actor, match.kickoffAt, now);
  await db.delete(matches).where(eq(matches.id, matchId));
}

/**
 * Puts a player on a team, moving them if they are already on the other team of that
 * match.
 *
 * @throws PlayerNotGoingError unless the player RSVP'd Going.
 */
export async function assignPlayer(
  db: DbExecutor,
  actor: Actor,
  input: { teamId: string; playerId: string },
  now = new Date(),
): Promise<void> {
  const [team] = await db
    .select({ matchId: gameDayTeams.matchId })
    .from(gameDayTeams)
    .where(eq(gameDayTeams.id, input.teamId));
  if (!team) throw new NotFoundError("Team");
  const match = await loadMatch(db, team.matchId);
  assertCanSort(actor, match.kickoffAt, now);

  const [going] = await db
    .select({ id: attendances.id })
    .from(attendances)
    .where(
      and(
        eq(attendances.gameweekId, match.gameweekId),
        eq(attendances.playerId, input.playerId),
        eq(attendances.rsvp, "GOING"),
      ),
    );
  if (!going) throw new PlayerNotGoingError();

  await db
    .insert(gameDayTeamPlayers)
    .values({ gameDayTeamId: input.teamId, playerId: input.playerId, matchId: team.matchId })
    .onConflictDoUpdate({
      target: [gameDayTeamPlayers.matchId, gameDayTeamPlayers.playerId],
      set: { gameDayTeamId: input.teamId },
    });
}

/** Takes a player off whichever team they are on in this match. */
export async function unassignPlayer(
  db: DbExecutor,
  actor: Actor,
  input: { matchId: string; playerId: string },
  now = new Date(),
): Promise<void> {
  const match = await loadMatch(db, input.matchId);
  assertCanSort(actor, match.kickoffAt, now);
  await db
    .delete(gameDayTeamPlayers)
    .where(and(eq(gameDayTeamPlayers.matchId, input.matchId), eq(gameDayTeamPlayers.playerId, input.playerId)));
}

/**
 * Everything the teams page needs: each match with its teams and members, plus the
 * players who are going but not yet on a team in that match.
 */
export async function getGameweekTeams(db: DbExecutor, gameweekId: string) {
  const matchRows = await db.select().from(matches).where(eq(matches.gameweekId, gameweekId)).orderBy(asc(matches.number));
  const teamRows = await db
    .select({ id: gameDayTeams.id, matchId: gameDayTeams.matchId, name: gameDayTeams.name })
    .from(gameDayTeams)
    .innerJoin(matches, eq(matches.id, gameDayTeams.matchId))
    .where(eq(matches.gameweekId, gameweekId))
    .orderBy(asc(gameDayTeams.name));
  const memberRows = await db
    .select({ teamId: gameDayTeamPlayers.gameDayTeamId, playerId: players.id, displayName: players.displayName })
    .from(gameDayTeamPlayers)
    .innerJoin(players, eq(players.id, gameDayTeamPlayers.playerId))
    .innerJoin(matches, eq(matches.id, gameDayTeamPlayers.matchId))
    .where(eq(matches.gameweekId, gameweekId))
    .orderBy(asc(players.displayName));
  const goingRows = await db
    .select({ playerId: players.id, displayName: players.displayName })
    .from(attendances)
    .innerJoin(players, eq(players.id, attendances.playerId))
    .where(and(eq(attendances.gameweekId, gameweekId), eq(attendances.rsvp, "GOING")))
    .orderBy(asc(players.displayName));

  return matchRows.map((match) => {
    const teams = teamRows
      .filter((team) => team.matchId === match.id)
      .map((team) => ({ ...team, players: memberRows.filter((m) => m.teamId === team.id) }));
    const assigned = new Set(teams.flatMap((team) => team.players.map((p) => p.playerId)));
    return { id: match.id, number: match.number, teams, unassigned: goingRows.filter((p) => !assigned.has(p.playerId)) };
  });
}
