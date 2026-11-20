import { describe, expect, it } from "vitest";
import { type EventView, type ScoringOp, applyOps, lastUndoable, mergeEvents, tallyScore } from "./match-events";

const goal = (clientId: string, teamId: string, at = "2026-11-28T14:00:00Z"): EventView => ({
  clientId, type: "GOAL", teamId, playerId: "p", relatedClientId: null, voided: false, occurredAt: at,
});
const assist = (clientId: string, goalId: string, teamId: string, at = "2026-11-28T14:00:01Z"): EventView => ({
  clientId, type: "ASSIST", teamId, playerId: "q", relatedClientId: goalId, voided: false, occurredAt: at,
});

describe("tallyScore", () => {
  it("counts goals per team, ignoring voided goals and other event types", () => {
    const events = [goal("g1", "A"), goal("g2", "A"), { ...goal("g3", "B"), voided: true }, assist("a1", "g1", "A")];
    expect(tallyScore(events, ["A", "B"])).toEqual({ A: 2, B: 0 });
  });
});

describe("applyOps", () => {
  const add = (e: EventView): ScoringOp => ({
    kind: "add", clientId: e.clientId, type: e.type, teamId: e.teamId, playerId: e.playerId,
    relatedClientId: e.relatedClientId, occurredAt: e.occurredAt,
  });

  it("adds queued events on top of what the server sent", () => {
    expect(applyOps([goal("g1", "A")], [add(goal("g2", "B"))]).map((e) => e.clientId)).toEqual(["g1", "g2"]);
  });

  it("is idempotent: replaying an op the server already has changes nothing", () => {
    const base = [goal("g1", "A")];
    const ops = [add(goal("g1", "A")), { kind: "void", clientId: "g1" } as const];
    const once = applyOps(base, ops);
    expect(applyOps(once, ops)).toEqual(once);
    expect(once).toHaveLength(1);
  });

  it("voiding a goal also voids its assist", () => {
    const result = applyOps([goal("g1", "A"), assist("a1", "g1", "A")], [{ kind: "void", clientId: "g1" }]);
    expect(result.every((e) => e.voided)).toBe(true);
  });

  it("voiding only an assist leaves the goal standing", () => {
    const result = applyOps([goal("g1", "A"), assist("a1", "g1", "A")], [{ kind: "void", clientId: "a1" }]);
    expect(result.map((e) => e.voided)).toEqual([false, true]);
  });

  it("does not mutate its input", () => {
    const base = [goal("g1", "A")];
    applyOps(base, [{ kind: "void", clientId: "g1" }]);
    expect(base[0]!.voided).toBe(false);
  });
});

describe("lastUndoable", () => {
  it("is the latest event not yet voided, or null", () => {
    const events = [goal("g1", "A", "2026-11-28T14:00:00Z"), goal("g2", "B", "2026-11-28T14:05:00Z")];
    expect(lastUndoable(events)?.clientId).toBe("g2");
    expect(lastUndoable([{ ...events[1]!, voided: true }, events[0]!])?.clientId).toBe("g1");
    expect(lastUndoable([])).toBeNull();
  });
});

describe("mergeEvents", () => {
  it("keeps events from both sides and voided wins", () => {
    const stale = [goal("g1", "A", "2026-11-28T14:00:00Z")];
    const fresh = [{ ...goal("g1", "A", "2026-11-28T14:00:00Z"), voided: true }, goal("g2", "B", "2026-11-28T14:05:00Z")];
    const merged = mergeEvents(stale, fresh);
    expect(merged.map((e) => [e.clientId, e.voided])).toEqual([["g1", true], ["g2", false]]);
    expect(mergeEvents(fresh, stale)).toEqual(merged);
  });
});
