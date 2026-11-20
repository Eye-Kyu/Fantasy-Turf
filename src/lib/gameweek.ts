/** Time rules for a gameweek. Pure functions: callers pass `now` so tests stay deterministic. */
import { TEAM_LOCK_HOURS_BEFORE_KICKOFF } from "@/lib/constants";

const MS_PER_HOUR = 60 * 60 * 1000;

/** The moment game-day teams lock and RSVPs close. */
export function teamsLockAt(kickoffAt: Date): Date {
  return new Date(kickoffAt.getTime() - TEAM_LOCK_HOURS_BEFORE_KICKOFF * MS_PER_HOUR);
}

/** True once teams can no longer be changed (the lock moment itself counts as locked). */
export function areTeamsLocked(kickoffAt: Date, now: Date): boolean {
  return now.getTime() >= teamsLockAt(kickoffAt).getTime();
}

/** RSVPs (and team changes) are open until the lock moment. */
export function areRsvpsOpen(kickoffAt: Date, now: Date): boolean {
  return !areTeamsLocked(kickoffAt, now);
}
