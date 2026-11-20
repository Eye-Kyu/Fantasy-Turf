/**
 * Domain types shared by pure logic (scoring, balancing, ratings) and the database
 * schema. The `event_type` enum in src/db/schema/enums.ts is built from this list, so
 * the code and the database cannot drift apart.
 */
export const EVENT_TYPES = ["GOAL", "ASSIST", "SAVE", "KEY_TACKLE"] as const;

export type EventType = (typeof EVENT_TYPES)[number];
