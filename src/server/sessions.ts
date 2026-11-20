/** Login sessions in the database. Cookie handling is in current-user.ts. */
import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { players, sessions, users } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";
import { isSessionExpired, sessionExpiry } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";

export interface SessionUser {
  userId: string;
  email: string;
  role: UserRole;
  /** The user's player profile (every user has one). */
  playerId: string | null;
}

/** Starts a session and returns the token to put in the user's cookie. */
export async function createSession(db: DbExecutor, userId: string, now = new Date()) {
  const token = generateToken();
  const expiresAt = sessionExpiry(now);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

/**
 * The user for a cookie token, or null if the token is unknown or expired. The role is
 * read fresh on every call, so a role change takes effect on the next request.
 */
export async function findSessionUser(
  db: DbExecutor,
  token: string,
  now = new Date(),
): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      role: users.role,
      playerId: players.id,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(players, eq(players.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash));

  if (!row) return null;
  if (isSessionExpired(row.expiresAt, now)) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  const { expiresAt: _expiresAt, ...user } = row;
  return user;
}

/** Ends the session for a token (logout). Unknown tokens are ignored. */
export async function deleteSession(db: DbExecutor, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
