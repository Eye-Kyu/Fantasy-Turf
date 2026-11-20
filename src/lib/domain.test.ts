import { describe, expect, it } from "vitest";
import { EVENT_POINTS } from "@/lib/constants";
import { EVENT_TYPES } from "@/lib/domain";
import { eventType } from "../db/schema";

describe("domain constants stay in sync with the database schema", () => {
  it("the event_type database enum has exactly the EVENT_TYPES values", () => {
    expect([...eventType.enumValues]).toEqual([...EVENT_TYPES]);
  });

  it("every event type has a points value", () => {
    expect(Object.keys(EVENT_POINTS).sort()).toEqual([...EVENT_TYPES].sort());
  });
});
