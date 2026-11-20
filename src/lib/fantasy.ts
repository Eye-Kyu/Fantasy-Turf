/**
 * Fantasy lineup scoring: pure functions over a frozen lineup and each player's real
 * gameweek result. The real points come from the match scoring (src/server/points.ts).
 */
import { CAPTAIN_MULTIPLIER } from "@/lib/constants";

export interface LineupMember {
  playerId: string;
  slot: "STARTER" | "BENCH";
  /** Auto-sub priority for bench players (1 = first); null for starters. */
  benchOrder: number | null;
  isCaptain: boolean;
}

/** A player's real result for the gameweek. */
export interface PlayerForm {
  /** Total points including fines (can be negative). */
  total: number;
  /** Points deducted by fines (positive). */
  finePoints: number;
  /** Turned up and played at least one match. */
  played: boolean;
}

export interface LineupPlayerScore {
  playerId: string;
  role: "starter" | "substitute" | "unused";
  /** Points this player adds to the squad (after the captain bonus). */
  points: number;
  captain: boolean;
}

const NO_RESULT: PlayerForm = { total: 0, finePoints: 0, played: false };

/**
 * Scores a lineup.
 *
 * - A starter who played counts their points; the captain's count double.
 * - A starter who did not play scores 0 from play, but a fine still lands on them.
 * - Each such starter is replaced by the highest-priority bench player who played.
 *   A bench player is used at most once, and a starter who played is never replaced.
 * - If the captain did not play there is no double (there is no vice-captain).
 */
export function scoreLineup(
  lineup: readonly LineupMember[],
  forms: ReadonlyMap<string, PlayerForm>,
): { total: number; players: LineupPlayerScore[] } {
  const formOf = (playerId: string) => forms.get(playerId) ?? NO_RESULT;
  const starters = lineup.filter((m) => m.slot === "STARTER");
  const bench = lineup
    .filter((m) => m.slot === "BENCH")
    .sort((a, b) => (a.benchOrder ?? Infinity) - (b.benchOrder ?? Infinity));
  const availableSubs = bench.filter((m) => formOf(m.playerId).played);

  const players: LineupPlayerScore[] = [];
  const usedSubs = new Set<string>();

  for (const starter of starters) {
    const form = formOf(starter.playerId);
    if (form.played) {
      const multiplier = starter.isCaptain ? CAPTAIN_MULTIPLIER : 1;
      players.push({ playerId: starter.playerId, role: "starter", points: form.total * multiplier, captain: starter.isCaptain });
      continue;
    }
    players.push({ playerId: starter.playerId, role: "starter", points: -form.finePoints, captain: starter.isCaptain });
    const sub = availableSubs.find((m) => !usedSubs.has(m.playerId));
    if (sub) {
      usedSubs.add(sub.playerId);
      players.push({ playerId: sub.playerId, role: "substitute", points: formOf(sub.playerId).total, captain: false });
    }
  }
  for (const member of bench) {
    if (!usedSubs.has(member.playerId)) {
      // Not coming on, but a fine still counts against the squad.
      players.push({ playerId: member.playerId, role: "unused", points: -formOf(member.playerId).finePoints, captain: false });
    }
  }
  return { total: players.reduce((sum, p) => sum + p.points, 0), players };
}
