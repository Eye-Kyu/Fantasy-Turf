import { describe, expect, it } from "vitest";
import { settlePool, walletBalance } from "./betting";

describe("settlePool", () => {
  const bets = [
    { id: "1", stake: 10, pick: "a" },
    { id: "2", stake: 30, pick: "a" },
    { id: "3", stake: 60, pick: "b" },
  ];
  it("shares the pool among winners by stake", () => {
    expect(settlePool(bets, new Set(["a"]))).toEqual([
      { id: "1", status: "WON", payout: 25 },
      { id: "2", status: "WON", payout: 75 },
      { id: "3", status: "LOST", payout: 0 },
    ]);
  });
  it("refunds when nobody won", () => {
    expect(settlePool(bets, new Set(["c"])).every((s) => s.status === "VOID")).toBe(true);
    expect(settlePool(bets, new Set())[2]).toEqual({ id: "3", status: "VOID", payout: 60 });
  });
  it("refunds when everybody won", () => {
    expect(settlePool(bets, new Set(["a", "b"])).map((s) => s.payout)).toEqual([10, 30, 60]);
  });
  it("never pays out more than the pool", () => {
    const paid = settlePool([{ id: "1", stake: 7, pick: "a" }, { id: "2", stake: 7, pick: "a" }, { id: "3", stake: 5, pick: "b" }], new Set(["a"]));
    expect(paid.reduce((s, x) => s + x.payout, 0)).toBeLessThanOrEqual(19);
  });
});

describe("walletBalance", () => {
  it("adds allowance per locked gameweek and nets bets", () => {
    expect(walletBalance({ lockedGameweeks: 2, bets: [{ stake: 20, payout: null }, { stake: 10, payout: 30 }] })).toBe(100 + 20 - 30 + 30);
  });
});
