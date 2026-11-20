/** Pure helpers for season awards and streaks. */

/** Every item tied for the highest positive value (empty if nobody has scored anything). */
export function leaders<T>(items: readonly T[], value: (item: T) => number): { value: number; items: T[] } | null {
  let best = 0;
  let winners: T[] = [];
  for (const item of items) {
    const v = value(item);
    if (v > best) { best = v; winners = [item]; }
    else if (v === best && v > 0) winners.push(item);
  }
  return best > 0 ? { value: best, items: winners } : null;
}

/** The longest run of consecutive `true`s (gameweeks played, in order). */
export function longestStreak(flags: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** `2026-11` style key for the Nairobi calendar month of a date, for player of the month. */
export function monthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}`;
}
