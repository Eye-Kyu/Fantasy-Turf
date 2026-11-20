import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, timestamptz } from "./columns";
import { gameweeks } from "./calendar";
import { matches } from "./matches";
import { players, users } from "./people";

// Catalog of fineable violations. Seeded from DEFAULT_VIOLATIONS in
// src/lib/violations.ts and editable afterwards.
export const violationTypes = pgTable(
  "violation_types",
  {
    id: id(),
    name: text().notNull().unique(),
    description: text(),
    // Suggested deduction (positive number); an individual fine may override it.
    defaultPoints: integer().notNull(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [check("violation_types_default_points_positive", sql`${t.defaultPoints} > 0`)],
);

// A deduction issued manually by an organizer. Voided, never deleted, so the history
// stays intact. Points are deducted from the player's gameweek score even if the
// player did not attend (e.g. a no-show after confirming).
export const fines = pgTable(
  "fines",
  {
    id: id(),
    playerId: uuid()
      .notNull()
      .references(() => players.id),
    gameweekId: uuid()
      .notNull()
      .references(() => gameweeks.id),
    // Optional: the match the violation happened in.
    matchId: uuid().references(() => matches.id),
    violationTypeId: uuid()
      .notNull()
      .references(() => violationTypes.id),
    // Points deducted (positive). Copied from the catalog at issue time so later
    // catalog edits never rewrite past scores.
    points: integer().notNull(),
    note: text(),
    issuedById: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    voidedAt: timestamptz(),
    voidedById: uuid().references(() => users.id),
  },
  (t) => [
    index().on(t.gameweekId, t.playerId),
    check("fines_points_positive", sql`${t.points} > 0`),
  ],
);
