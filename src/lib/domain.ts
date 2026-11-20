/**
 * Domain types shared by pure logic (scoring, balancing, ratings).
 *
 * The event types mirror the `EventType` enum in prisma/schema.prisma. They are
 * declared here so pure logic and its tests do not depend on a generated Prisma
 * client; src/lib/domain.test.ts fails if the two ever drift apart.
 */
export const EVENT_TYPES = ["GOAL", "ASSIST", "SAVE", "KEY_TACKLE"] as const;

export type EventType = (typeof EVENT_TYPES)[number];
