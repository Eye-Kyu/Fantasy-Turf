import { describe, expect, it } from "vitest";
import { leaders, longestStreak, monthKey } from "./awards";
import { matchSummaryText, whatsappShareUrl } from "./share";

describe("awards helpers", () => {
  it("finds tied leaders and ignores zero", () => {
    expect(leaders([{ n: "a", v: 2 }, { n: "b", v: 3 }, { n: "c", v: 3 }], (x) => x.v)?.items.map((x) => x.n)).toEqual(["b", "c"]);
    expect(leaders([{ v: 0 }], (x) => x.v)).toBeNull();
  });
  it("finds the longest streak", () => {
    expect(longestStreak([true, true, false, true, true, true, false])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
  it("uses Nairobi months", () => {
    expect(monthKey(new Date("2026-11-30T22:00:00Z"))).toBe("2026-12");
    expect(monthKey(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11");
  });
});

describe("share text", () => {
  it("summarises a match", () => {
    const text = matchSummaryText({
      gameweekNumber: 3, matchNumber: 1,
      teams: [{ name: "Team A", goals: 3 }, { name: "Team B", goals: 1 }],
      scorers: [{ name: "Juma", goals: 2, assists: 0 }, { name: "Otieno", goals: 0, assists: 1 }, { name: "Quiet", goals: 0, assists: 0 }],
    });
    expect(text).toContain("Team A 3 - 1 Team B");
    expect(text).toContain("• Juma: 2 goals");
    expect(text).toContain("• Otieno: 1 assist");
    expect(text).not.toContain("Quiet");
    expect(whatsappShareUrl("a b")).toBe("https://wa.me/?text=a%20b");
  });
});
