import { describe, expect, it } from "vitest";
import { areRsvpsOpen, areTeamsLocked, teamsLockAt } from "./gameweek";

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

describe("areRsvpsOpen", () => {
  const kickoff = new Date("2026-11-28T13:00:00Z");

  it("is open until three hours before kick-off, then closed", () => {
    expect(areRsvpsOpen(kickoff, new Date("2026-11-28T09:59:59Z"))).toBe(true);
    expect(areRsvpsOpen(kickoff, new Date("2026-11-28T10:00:00Z"))).toBe(false);
  });
});
