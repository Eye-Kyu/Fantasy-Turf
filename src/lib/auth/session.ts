/** Session lifetime rules. The token itself is in tokens.ts. */

/** How long a login lasts before the user must sign in again. */
export const SESSION_TTL_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** When a session created at `now` stops being valid. */
export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * MS_PER_DAY);
}

/** True once the expiry moment has been reached. */
export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
