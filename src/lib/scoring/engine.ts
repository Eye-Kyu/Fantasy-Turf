/**
 * Match scoring engine: pure functions, no database or framework access.
 * Input validation (who may score, attendance, locking) happens at the API boundary;
 * this module only turns a match's events and roster into points.
 */
import {
  EVENT_POINTS,
  GOAL_DIFF_BONUS_POINTS,
  GOAL_DIFF_BONUS_THRESHOLD,
} from "@/lib/constants";
import type { EventType } from "@/lib/domain";

export interface ScoringEvent {
  id: string;
  type: EventType;
  playerId: string;
  gameDayTeamId: string;
  occurredAt: Date;
  /** Voided events (undo / reconciliation fixes) never score. */
  voidedAt: Date | null;
}

/** A player who attended and was placed on a game-day team for this match. */
export interface RosterEntry {
  playerId: string;
  gameDayTeamId: string;
}

const isActive = (event: ScoringEvent): boolean => event.voidedAt === null;

/**
 * Returns the game-day teams that earn the goal-difference bonus: those that led by
 * GOAL_DIFF_BONUS_THRESHOLD or more at any point of the match.
 *
 * The check replays goals in order against the running score, not the final score:
 * a team that led 2-0 and was pegged back to 2-2 still earns the bonus.
 */
export function teamsEarningGoalDiffBonus(
  events: readonly ScoringEvent[],
  roster: readonly RosterEntry[],
): Set<string> {
  const scores = new Map<string, number>(roster.map((r) => [r.gameDayTeamId, 0]));
  const earned = new Set<string>();

  // A lead needs an opponent; a match with fewer than two teams cannot have one.
  if (scores.size < 2) return earned;

  const goals = events
    .filter((e) => isActive(e) && e.type === "GOAL")
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  for (const goal of goals) {
    const teamScore = (scores.get(goal.gameDayTeamId) ?? 0) + 1;
    scores.set(goal.gameDayTeamId, teamScore);

    const bestOpponent = Math.max(
      ...[...scores].filter(([id]) => id !== goal.gameDayTeamId).map(([, s]) => s),
    );
    if (teamScore - bestOpponent >= GOAL_DIFF_BONUS_THRESHOLD) {
      earned.add(goal.gameDayTeamId);
    }
  }
  return earned;
}

/**
 * Scores one match. Every rostered player appears in the result (0 if they did
 * nothing), so callers can tell "played, scored 0" from "did not attend".
 *
 * @throws if an active event belongs to a player who is not on the roster; that is
 *   a data-integrity problem to surface at reconciliation, not to score around.
 */
export function scoreMatch(
  events: readonly ScoringEvent[],
  roster: readonly RosterEntry[],
): Map<string, number> {
  const points = new Map<string, number>(roster.map((r) => [r.playerId, 0]));

  for (const event of events.filter(isActive)) {
    const current = points.get(event.playerId);
    if (current === undefined) {
      throw new Error(
        `Event ${event.id} references player ${event.playerId}, who is not on a game-day team in this match`,
      );
    }
    points.set(event.playerId, current + EVENT_POINTS[event.type]);
  }

  const bonusTeams = teamsEarningGoalDiffBonus(events, roster);
  for (const { playerId, gameDayTeamId } of roster) {
    if (bonusTeams.has(gameDayTeamId)) {
      points.set(playerId, (points.get(playerId) ?? 0) + GOAL_DIFF_BONUS_POINTS);
    }
  }
  return points;
}
