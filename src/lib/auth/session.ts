/**
 * Session token rules. The browser holds a random token; the database holds only its
 * SHA-256 hash (see the `sessions` table), so a database leak does not expose logins.
 */
import { createHash, randomBytes } from "node:crypto";

/** How long a login lasts before the user must sign in again. */
export const SESSION_TTL_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A new unguessable token (256 bits), safe to put in a cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The value stored in the database for a token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** When a session created at `now` stops being valid. */
export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * MS_PER_DAY);
}

/** True once the expiry moment has been reached. */
export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
