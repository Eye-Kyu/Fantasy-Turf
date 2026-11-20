import { describe, expect, it } from "vitest";
import { formatKickoff, parseNairobiDateTime } from "./time";

describe("Nairobi time", () => {
  it("reads a form time as UTC+3", () => {
    expect(parseNairobiDateTime("2026-11-28T16:00")?.toISOString()).toBe("2026-11-28T13:00:00.000Z");
  });

  it("rejects malformed or impossible times", () => {
    for (const bad of ["", "2026-11-28", "2026-11-28 16:00", "2026-13-40T99:00"]) {
      expect(parseNairobiDateTime(bad)).toBeNull();
    }
  });

  it("shows a stored moment in Nairobi time", () => {
    expect(formatKickoff(new Date("2026-11-28T13:00:00Z"))).toBe("Sat 28 Nov, 16:00");
  });
});
