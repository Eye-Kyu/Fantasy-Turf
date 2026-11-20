import { describe, expect, it } from "vitest";
import { DEFAULT_VIOLATIONS } from "./violations";

describe("DEFAULT_VIOLATIONS", () => {
  it("has unique names, since ViolationType.name is unique in the database", () => {
    const names = DEFAULT_VIOLATIONS.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("deducts a positive whole number of points", () => {
    for (const violation of DEFAULT_VIOLATIONS) {
      expect(Number.isInteger(violation.defaultPoints)).toBe(true);
      expect(violation.defaultPoints).toBeGreaterThan(0);
    }
  });

  it("includes the house rule about entering the D", () => {
    expect(DEFAULT_VIOLATIONS.some((v) => v.name === "Entering the D")).toBe(true);
  });
});
