/** Seasons, gameweeks, RSVPs and confirmed attendance. */
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { attendances, gameDayTeamPlayers, gameweeks, matches, players, seasons } from "@/db/schema";
import { areRsvpsOpen } from "@/lib/gameweek";
import { type Actor, assertCan } from "./actor";
import { isUniqueViolation } from "./db-errors";
import { NotFoundError, RsvpClosedError, SeasonExistsError } from "./errors";

export async function createSeason(db: DbExecutor, actor: Actor, input: { name: string; startsOn: string }) {
  assertCan(actor, "manageCalendar");
  try {
    const [season] = await db.insert(seasons).values(input).returning({ id: seasons.id });
    return season!;
  } catch (error) {
    if (isUniqueViolation(error)) throw new SeasonExistsError(input.name);
    throw error;
  }
}

/** Newest season first. */
export async function listSeasons(db: DbExecutor) {
  return db.select().from(seasons).orderBy(desc(seasons.startsOn));
}

/** Adds the next numbered gameweek to a season. */
export async function createGameweek(db: DbExecutor, actor: Actor, input: { seasonId: string; kickoffAt: Date }) {
  assertCan(actor, "manageCalendar");
  const [season] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, input.seasonId));
  if (!season) throw new NotFoundError("Season");

  const [latest] = await db
    .select({ number: sql<number>`coalesce(max(${gameweeks.number}), 0)::int` })
    .from(gameweeks)
    .where(eq(gameweeks.seasonId, input.seasonId));
  const [gameweek] = await db
    .insert(gameweeks)
    .values({
      seasonId: input.seasonId,
      number: latest!.number + 1,
      kickoffAt: input.kickoffAt,
    })
    .returning({ id: gameweeks.id });
  return gameweek!;
}

export async function listGameweeks(db: DbExecutor, seasonId: string) {
  return db.select().from(gameweeks).where(eq(gameweeks.seasonId, seasonId)).orderBy(asc(gameweeks.number));
}

export async function getGameweek(db: DbExecutor, gameweekId: string) {
  const [row] = await db
    .select({ gameweek: gameweeks, seasonName: seasons.name })
    .from(gameweeks)
    .innerJoin(seasons, eq(seasons.id, gameweeks.seasonId))
    .where(eq(gameweeks.id, gameweekId));
  return row ? { ...row.gameweek, seasonName: row.seasonName } : null;
}

/** The soonest gameweek that has not kicked off yet, or null. */
export async function getNextGameweek(db: DbExecutor, now = new Date()) {
  const [row] = await db
    .select({ id: gameweeks.id })
    .from(gameweeks)
    .where(gt(gameweeks.kickoffAt, now))
    .orderBy(asc(gameweeks.kickoffAt))
    .limit(1);
  return row ? getGameweek(db, row.id) : null;
}

/**
 * Sets a player's RSVP. Players change only their own, and only until the lock.
 * Organizers may set anyone's at any time (e.g. a late drop-out told to them on WhatsApp).
 *
 * @throws RsvpClosedError if a player tries after the lock.
 */
export async function setRsvp(
  db: DbExecutor,
  actor: Actor,
  input: { gameweekId: string; playerId: string; status: "GOING" | "NOT_GOING" },
  now = new Date(),
): Promise<void> {
  const gameweek = await getGameweek(db, input.gameweekId);
  if (!gameweek) throw new NotFoundError("Gameweek");

  const [own] = await db.select({ id: players.id }).from(players).where(eq(players.userId, actor.userId));
  const isOwn = own?.id === input.playerId;
  if (!isOwn) assertCan(actor, "confirmAttendance");
  if (isOwn && !areRsvpsOpen(gameweek.kickoffAt, now)) throw new RsvpClosedError();

  await db.transaction(async (tx) => {
    await tx
      .insert(attendances)
      .values({ gameweekId: input.gameweekId, playerId: input.playerId, rsvp: input.status })
      .onConflictDoUpdate({ target: [attendances.gameweekId, attendances.playerId], set: { rsvp: input.status } });

    // Someone who is no longer coming must not stay on a team (teams only hold Going players).
    if (input.status === "NOT_GOING") {
      await tx.delete(gameDayTeamPlayers).where(
        and(
          eq(gameDayTeamPlayers.playerId, input.playerId),
          inArray(
            gameDayTeamPlayers.matchId,
            tx.select({ id: matches.id }).from(matches).where(eq(matches.gameweekId, input.gameweekId)),
          ),
        ),
      );
    }
  });
}

/** Records on game day whether a player actually turned up. Organizers only. */
export async function confirmAttendance(
  db: DbExecutor,
  actor: Actor,
  input: { gameweekId: string; playerId: string; attended: boolean },
): Promise<void> {
  assertCan(actor, "confirmAttendance");
  const gameweek = await getGameweek(db, input.gameweekId);
  if (!gameweek) throw new NotFoundError("Gameweek");

  await db
    .insert(attendances)
    .values({ gameweekId: input.gameweekId, playerId: input.playerId, attended: input.attended })
    .onConflictDoUpdate({ target: [attendances.gameweekId, attendances.playerId], set: { attended: input.attended } });
}

/** Every player with their RSVP and attendance for a gameweek (no row means no response). */
export async function listAttendance(db: DbExecutor, gameweekId: string) {
  return db
    .select({
      playerId: players.id,
      displayName: players.displayName,
      rsvp: sql<"GOING" | "NOT_GOING" | "NO_RESPONSE">`coalesce(${attendances.rsvp}, 'NO_RESPONSE')`,
      attended: sql<boolean>`coalesce(${attendances.attended}, false)`,
    })
    .from(players)
    .leftJoin(attendances, and(eq(attendances.playerId, players.id), eq(attendances.gameweekId, gameweekId)))
    .orderBy(asc(players.displayName));
}

/** The signed-in player's own RSVP for a gameweek. */
export async function getOwnRsvp(db: DbExecutor, userId: string, gameweekId: string) {
  const [row] = await db
    .select({ rsvp: attendances.rsvp })
    .from(attendances)
    .innerJoin(players, eq(players.id, attendances.playerId))
    .where(and(eq(players.userId, userId), eq(attendances.gameweekId, gameweekId)));
  return row?.rsvp ?? "NO_RESPONSE";
}
