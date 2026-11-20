/**
 * Locks sign-in for an identifier after repeated failures, which stops password
 * guessing. Counted per identifier (not per IP) because the app may sit behind a
 * proxy; the trade-off is that someone can lock a known account for a short time.
 */
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { loginFailures } from "@/db/schema";
import { LOGIN_LOCK_WINDOW_MINUTES, MAX_FAILED_LOGINS } from "@/lib/auth/policy";

const windowStart = (now: Date) => new Date(now.getTime() - LOGIN_LOCK_WINDOW_MINUTES * 60_000);

export async function isLoginLocked(db: DbExecutor, identifier: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ failures: sql<number>`count(*)::int` })
    .from(loginFailures)
    .where(and(eq(loginFailures.identifier, identifier), gt(loginFailures.createdAt, windowStart(now))));
  return (row?.failures ?? 0) >= MAX_FAILED_LOGINS;
}

/** Records a failure and drops rows too old to matter, so the table stays small. */
export async function recordFailedLogin(db: DbExecutor, identifier: string, now: Date): Promise<void> {
  await db.insert(loginFailures).values({ identifier, createdAt: now });
  await db.delete(loginFailures).where(lt(loginFailures.createdAt, windowStart(now)));
}

export async function clearFailedLogins(db: DbExecutor, identifier: string): Promise<void> {
  await db.delete(loginFailures).where(eq(loginFailures.identifier, identifier));
}
