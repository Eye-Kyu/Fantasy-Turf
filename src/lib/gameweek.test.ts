import { describe, expect, it } from "vitest";
import { areTeamsLocked, teamsLockAt } from "./gameweek";

const kickoff = new Date("2026-11-21T16:00:00+03:00");

describe("teamsLockAt", () => {
  it("is 3 hours before kick-off", () => {
    expect(teamsLockAt(kickoff).toISOString()).toBe(
      new Date("2026-11-21T13:00:00+03:00").toISOString(),
    );
  });
});

describe("areTeamsLocked", () => {
  it("is open one second before the lock", () => {
    expect(areTeamsLocked(kickoff, new Date("2026-11-21T12:59:59+03:00"))).toBe(false);
  });

  it("is locked exactly at the lock moment", () => {
    expect(areTeamsLocked(kickoff, new Date("2026-11-21T13:00:00+03:00"))).toBe(true);
  });

  it("stays locked through and after kick-off", () => {
    expect(areTeamsLocked(kickoff, kickoff)).toBe(true);
    expect(areTeamsLocked(kickoff, new Date("2026-11-22T00:00:00+03:00"))).toBe(true);
  });
});
