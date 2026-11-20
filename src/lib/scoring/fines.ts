/**
 * Manual fines: deductions an organizer issues for rule breaking. Pure functions, in
 * the same style as engine.ts; permissions and persistence live at the API boundary.
 */

export interface FineRecord {
  playerId: string;
  /** Points deducted, a positive number (copied from the violation at issue time). */
  points: number;
  /** Voided fines (issued by mistake, or overturned) are ignored. */
  voidedAt: Date | null;
}

/**
 * Subtracts every active fine from the players' gameweek points.
 *
 * A fined player missing from `points` (e.g. a no-show after confirming) is added
 * with 0 first, so the fine still lands and their total goes negative. The input map
 * is not modified.
 */
export function applyFines(
  points: ReadonlyMap<string, number>,
  fines: readonly FineRecord[],
): Map<string, number> {
  const result = new Map(points);
  for (const fine of fines) {
    if (fine.voidedAt !== null) continue;
    result.set(fine.playerId, (result.get(fine.playerId) ?? 0) - fine.points);
  }
  return result;
}
