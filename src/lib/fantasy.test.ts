import { describe, expect, it } from "vitest";
import { type LineupMember, type PlayerForm, scoreLineup } from "./fantasy";

const lineup = (captain = "s1"): LineupMember[] => [
  ...["s1", "s2", "s3", "s4"].map((playerId) => ({ playerId, slot: "STARTER" as const, benchOrder: null, isCaptain: playerId === captain })),
  { playerId: "b1", slot: "BENCH", benchOrder: 1, isCaptain: false },
  { playerId: "b2", slot: "BENCH", benchOrder: 2, isCaptain: false },
];
const played = (total: number, finePoints = 0): PlayerForm => ({ total, finePoints, played: true });
const absent = (finePoints = 0): PlayerForm => ({ total: -finePoints, finePoints, played: false });
const forms = (entries: Record<string, PlayerForm>) => new Map(Object.entries(entries));

describe("scoreLineup", () => {
  it("adds starters' points and doubles the captain's", () => {
    const result = scoreLineup(lineup(), forms({ s1: played(5), s2: played(2), s3: played(0), s4: played(1), b1: played(9) }));
    expect(result.total).toBe(5 * 2 + 2 + 0 + 1); // bench player who is not needed adds nothing
    expect(result.players.find((p) => p.playerId === "b1")?.role).toBe("unused");
  });

  it("subs in the first bench player who played for a starter who did not", () => {
    const result = scoreLineup(lineup(), forms({ s1: played(1), s2: absent(), s3: played(2), s4: played(2), b1: absent(), b2: played(4) }));
    expect(result.total).toBe(1 * 2 + 0 + 2 + 2 + 4);
    expect(result.players.find((p) => p.playerId === "b2")?.role).toBe("substitute");
  });

  it("uses bench order when both could come on, and each bench player only once", () => {
    const result = scoreLineup(
      lineup(),
      forms({ s1: played(0), s2: absent(), s3: absent(), s4: absent(), b1: played(3), b2: played(7) }),
    );
    expect(result.total).toBe(3 + 7); // two subs for three absent starters; the third slot stays empty
  });

  it("never replaces a starter who played, however poorly", () => {
    const result = scoreLineup(lineup(), forms({ s1: played(-3), s2: played(0), s3: played(0), s4: played(0), b1: played(10) }));
    expect(result.total).toBe(-6);
  });

  it("gives no captain bonus when the captain did not play", () => {
    const result = scoreLineup(lineup("s1"), forms({ s1: absent(), s2: played(2), s3: played(2), s4: played(2), b1: played(3) }));
    expect(result.total).toBe(2 + 2 + 2 + 3);
  });

  it("still deducts a no-show's fine, and a fined bench player who stays on the bench", () => {
    const result = scoreLineup(lineup(), forms({ s1: played(1), s2: absent(3), s3: played(0), s4: played(0), b1: absent(2), b2: played(4) }));
    expect(result.total).toBe(2 + -3 + 0 + 0 + 4 + -2); // b1 absent so b2 comes on; b1's fine still counts
  });

  it("treats players with no result as not having played", () => {
    expect(scoreLineup(lineup(), new Map()).total).toBe(0);
  });
});
