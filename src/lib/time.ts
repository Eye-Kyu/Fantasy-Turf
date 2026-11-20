/**
 * Game days are in Nairobi (EAT, UTC+3, no daylight saving), whatever timezone the
 * server runs in. Forms send a wall-clock time; it is read and shown as Nairobi time.
 */
export const APP_TIME_ZONE = "Africa/Nairobi";

/**
 * Reads a `datetime-local` value ("2026-11-28T16:00") as Nairobi time.
 * Returns null if it is not a valid date and time.
 */
export function parseNairobiDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sat 28 Nov, 16:00" in Nairobi time. */
export function formatKickoff(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "14:03" in Nairobi time, for event logs. */
export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
