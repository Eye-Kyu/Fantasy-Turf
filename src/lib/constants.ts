/**
 * Single source of truth for league rules. Import these everywhere; never hardcode
 * a point value, squad size or limit elsewhere (see CODING_STANDARDS.md).
 */
import type { EventType } from "@/lib/domain";

/** Fantasy squad shape: 4 starters + 2 bench. */
export const SQUAD = { STARTERS: 4, BENCH: 2 } as const;

/**
 * Transfers allowed per gameweek. Also enforced by the unique constraint on
 * `Transfer(squadId, gameweekId)`; raising this means dropping that constraint.
 */
export const TRANSFERS_PER_GAMEWEEK = 1;

/** The captain's points are multiplied by this. */
export const CAPTAIN_MULTIPLIER = 2;

/** A team earns the goal-difference bonus once it leads by this many goals. */
export const GOAL_DIFF_BONUS_THRESHOLD = 2;

/** Points given to every player on a team that earns the goal-difference bonus. */
export const GOAL_DIFF_BONUS_POINTS = 1;

/**
 * Points per individual event. `Record<EventType, number>` makes the compiler flag
 * any new event type that has no value here.
 *
 * Rule breaking is not an event: deductions are issued manually as fines (see
 * src/lib/scoring/fines.ts).
 *
 * TODO: values of 0 are undecided, see "Open items" in CLAUDE.md. Defenders are not
 * worth picking until SAVE / KEY_TACKLE (and a clean-sheet bonus) are set.
 */
export const EVENT_POINTS: Record<EventType, number> = {
  GOAL: 2,
  ASSIST: 1,
  SAVE: 0,
  KEY_TACKLE: 0,
};

/**
 * Game-day teams lock, and RSVPs close, this many hours before kick-off. Sorting
 * into teams happens before this moment; nobody is moved after it.
 */
export const TEAM_LOCK_HOURS_BEFORE_KICKOFF = 3;

/** Upper bound for one fine's deduction, to catch typos (e.g. 30 instead of 3). */
export const MAX_FINE_POINTS = 20;
