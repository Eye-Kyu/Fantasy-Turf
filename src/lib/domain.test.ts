import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENT_POINTS } from "@/lib/constants";
import { EVENT_TYPES } from "@/lib/domain";

/** Reads the values of `enum <name> { ... }` out of the Prisma schema. */
function schemaEnumValues(name: string): string[] {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const body = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`))?.[1] ?? "";
  return body
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

describe("domain constants stay in sync with the database schema", () => {
  it("EVENT_TYPES matches the Prisma EventType enum", () => {
    expect([...EVENT_TYPES]).toEqual(schemaEnumValues("EventType"));
  });

  it("every event type has a points value", () => {
    expect(Object.keys(EVENT_POINTS).sort()).toEqual([...EVENT_TYPES].sort());
  });
});
