import { describe, expect, it } from "vitest";
import type { EventType } from "@/lib/domain";
import {
  breakdownMatch,
  scoreMatch,
  teamsEarningGoalDiffBonus,
  type RosterEntry,
  type ScoringEvent,
} from "./engine";

// Two game-day teams of two players each.
const roster: RosterEntry[] = [
  { playerId: "a1", gameDayTeamId: "A" },
  { playerId: "a2", gameDayTeamId: "A" },
  { playerId: "b1", gameDayTeamId: "B" },
  { playerId: "b2", gameDayTeamId: "B" },
];

let clock = 0;
/** Builds an event; each call occurs one minute after the previous one. */
function event(
  type: EventType,
  playerId: string,
  gameDayTeamId: string,
  overrides: Partial<ScoringEvent> = {},
): ScoringEvent {
  clock += 1;
  return {
    id: `e${clock}`,
    type,
    playerId,
    gameDayTeamId,
    occurredAt: new Date(2026, 0, 1, 12, clock),
    voidedAt: null,
    ...overrides,
  };
}

const goal = (playerId: string, team: string) => event("GOAL", playerId, team);

describe("scoreMatch", () => {
  it("gives every rostered player 0 when nothing happened", () => {
    const points = scoreMatch([], roster);
    expect([...points.values()]).toEqual([0, 0, 0, 0]);
  });

  it("awards 2 for a goal and 1 for an assist", () => {
    const points = scoreMatch([goal("a1", "A"), event("ASSIST", "a2", "A")], roster);
    expect(points.get("a1")).toBe(2);
    expect(points.get("a2")).toBe(1);
  });

  it("ignores voided events", () => {
    const voided = event("GOAL", "a1", "A", { voidedAt: new Date() });
    expect(scoreMatch([voided], roster).get("a1")).toBe(0);
  });

  it("gives the bonus to every player on the leading team, not just scorers", () => {
    const points = scoreMatch([goal("a1", "A"), goal("a1", "A")], roster);
    expect(points.get("a1")).toBe(2 + 2 + 1); // two goals + bonus
    expect(points.get("a2")).toBe(1); // bonus only
    expect(points.get("b1")).toBe(0);
  });

  it("throws when an event belongs to a player who is not on the roster", () => {
    expect(() => scoreMatch([goal("ghost", "A")], roster)).toThrow(/ghost/);
  });
});

describe("teamsEarningGoalDiffBonus", () => {
  it("does not trigger at a one-goal lead", () => {
    expect(teamsEarningGoalDiffBonus([goal("a1", "A")], roster).size).toBe(0);
  });

  it("keeps the bonus when the lead is later pegged back to a draw", () => {
    const events = [goal("a1", "A"), goal("a2", "A"), goal("b1", "B"), goal("b2", "B")];
    expect([...teamsEarningGoalDiffBonus(events, roster)]).toEqual(["A"]);
  });

  it("is earned once per team however large the lead grows", () => {
    const events = [goal("a1", "A"), goal("a1", "A"), goal("a1", "A")];
    const points = scoreMatch(events, roster);
    expect(points.get("a2")).toBe(1); // a single bonus point
  });

  it("replays goals chronologically even when events arrive out of order", () => {
    // Chronologically A, A, B: A led 2-0 before the equaliser. Processed in the
    // order supplied (B, A, A) A would never lead by 2, so this proves the sort.
    const first = goal("a1", "A");
    const second = goal("a2", "A");
    const equaliser = goal("b1", "B");
    expect(teamsEarningGoalDiffBonus([equaliser, second, first], roster).has("A")).toBe(true);
  });

  it("gives no bonus when there is only one team", () => {
    const solo = roster.filter((r) => r.gameDayTeamId === "A");
    expect(teamsEarningGoalDiffBonus([goal("a1", "A"), goal("a1", "A")], solo).size).toBe(0);
  });
});

describe("breakdownMatch", () => {
  it("counts each kind of event and separates the team bonus from personal points", () => {
    const events = [
      event("GOAL", "a1", "A"),
      event("ASSIST", "a2", "A"),
      event("GOAL", "a1", "A"), // A leads 2-0: bonus
      event("SAVE", "b2", "B"),
      event("KEY_TACKLE", "b1", "B"),
    ];
    const result = breakdownMatch(events, roster);
    expect(result.get("a1")).toEqual({ goals: 2, assists: 0, saves: 0, keyTackles: 0, eventPoints: 4, bonusPoints: 1 });
    expect(result.get("a2")).toMatchObject({ assists: 1, eventPoints: 1, bonusPoints: 1 });
    expect(result.get("b2")).toMatchObject({ saves: 1, bonusPoints: 0 });
    expect(result.get("b1")).toMatchObject({ keyTackles: 1, bonusPoints: 0 });
  });

  it("agrees with scoreMatch", () => {
    const events = [event("GOAL", "b1", "B"), event("GOAL", "b2", "B"), event("ASSIST", "b1", "B")];
    for (const [playerId, total] of scoreMatch(events, roster)) {
      const b = breakdownMatch(events, roster).get(playerId)!;
      expect(b.eventPoints + b.bonusPoints).toBe(total);
    }
  });
});

describe("bonus when one side has nobody on the roster", () => {
  it("still counts the empty team as the opponent", () => {
    const events = [event("GOAL", "a1", "A"), event("GOAL", "a1", "A")];
    const onlyA = roster.filter((r) => r.gameDayTeamId === "A");
    expect(breakdownMatch(events, onlyA).get("a2")!.bonusPoints).toBe(0); // no opponent known
    expect(breakdownMatch(events, onlyA, ["A", "B"]).get("a2")!.bonusPoints).toBe(1);
  });
});
