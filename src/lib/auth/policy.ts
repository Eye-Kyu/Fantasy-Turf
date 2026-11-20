/** Tunable security limits for sign-in and invites. */

/** Failed sign-ins allowed per identifier within the window before it is locked. */
export const MAX_FAILED_LOGINS = 5;
export const LOGIN_LOCK_WINDOW_MINUTES = 15;

/** How long an invite link works. */
export const INVITE_TTL_DAYS = 7;

/** A password reset link works for this many hours. */
export const RESET_TTL_HOURS = 24;
