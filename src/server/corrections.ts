/**
 * After a gameweek has locked, ratings and bets were already settled. When an organizer
 * then corrects something that changes the result (an event override, a fine, attendance,
 * man of the match), call this so they are settled again from the corrected result.
 * Does nothing for a gameweek that has not locked yet (locking will do it).
 */
import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { gameweeks } from "@/db/schema";
import { resettleGameweekBets } from "./betting";
import { recalculateGameweekRatings } from "./ratings";

export async function refreshAfterCorrection(db: DbExecutor, gameweekId: string): Promise<boolean> {
  const [gameweek] = await db.select({ lockedAt: gameweeks.lockedAt }).from(gameweeks).where(eq(gameweeks.id, gameweekId));
  if (!gameweek?.lockedAt) return false;
  await recalculateGameweekRatings(db, gameweekId);
  await resettleGameweekBets(db, gameweekId);
  return true;
}
