/**
 * Updates player ratings, prices and attendance streaks when a gameweek is locked.
 * Runs once per gameweek (the player_ratings rows double as the "already done" marker),
 * so later overrides or fines after the lock do not change ratings.
 */
import { and, eq, lte } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { attendances, gameweeks, playerRatings, players } from "@/db/schema";
import { applyRatingDelta, priceFromRating, ratingDelta } from "@/lib/rating";
import { getGameweekPoints } from "./points";

/**
 * Applies the gameweek's results to every player who had joined by kick-off.
 * @returns how many players were rated (0 if this gameweek was already applied).
 */
export async function applyGameweekRatings(db: DbExecutor, gameweekId: string): Promise<number> {
  const [gameweek] = await db.select().from(gameweeks).where(eq(gameweeks.id, gameweekId));
  if (!gameweek) return 0;

  const already = await db.select({ id: playerRatings.id }).from(playerRatings).where(eq(playerRatings.gameweekId, gameweekId)).limit(1);
  if (already.length > 0) return 0;

  const { rows } = await getGameweekPoints(db, gameweekId);
  const resultOf = new Map(rows.map((row) => [row.playerId, row]));
  const going = new Set(
    (await db.select({ playerId: attendances.playerId, rsvp: attendances.rsvp }).from(attendances).where(eq(attendances.gameweekId, gameweekId)))
      .filter((a) => a.rsvp === "GOING")
      .map((a) => a.playerId),
  );

  // Someone who joined after this game was played is not marked absent from it.
  const eligible = await db.select().from(players).where(lte(players.createdAt, gameweek.kickoffAt));
  for (const player of eligible) {
    const result = resultOf.get(player.id);
    const played = (result?.matchesPlayed ?? 0) > 0;
    const delta = ratingDelta({
      goals: result?.goals ?? 0,
      assists: result?.assists ?? 0,
      played,
      streakBefore: player.currentStreak,
      rsvpGoing: going.has(player.id),
      finePoints: result?.finePoints ?? 0,
    });
    const rating = applyRatingDelta(player.rating, delta);

    await db.insert(playerRatings).values({ playerId: player.id, gameweekId, rating, delta });
    await db
      .update(players)
      .set({ rating, price: priceFromRating(rating).toFixed(1), currentStreak: played ? player.currentStreak + 1 : 0 })
      .where(and(eq(players.id, player.id)));
  }
  return eligible.length;
}
