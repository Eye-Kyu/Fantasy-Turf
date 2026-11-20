import { describe, expect, it } from "vitest";
import { applyFines, type FineRecord } from "./fines";

const fine = (playerId: string, points: number, voidedAt: Date | null = null): FineRecord => ({
  playerId,
  points,
  voidedAt,
});

describe("applyFines", () => {
  it("subtracts a fine from the player's points", () => {
    const result = applyFines(new Map([["p1", 5]]), [fine("p1", 1)]);
    expect(result.get("p1")).toBe(4);
  });

  it("adds up several fines for the same player", () => {
    const result = applyFines(new Map([["p1", 5]]), [fine("p1", 1), fine("p1", 2)]);
    expect(result.get("p1")).toBe(2);
  });

  it("ignores voided fines", () => {
    const result = applyFines(new Map([["p1", 5]]), [fine("p1", 3, new Date())]);
    expect(result.get("p1")).toBe(5);
  });

  it("fines a player who has no points entry, taking them below zero", () => {
    const result = applyFines(new Map(), [fine("noShow", 2)]);
    expect(result.get("noShow")).toBe(-2);
  });

  it("leaves unfined players and the input map untouched", () => {
    const input = new Map([
      ["p1", 5],
      ["p2", 3],
    ]);
    const result = applyFines(input, [fine("p1", 1)]);
    expect(result.get("p2")).toBe(3);
    expect(input.get("p1")).toBe(5);
  });
});
