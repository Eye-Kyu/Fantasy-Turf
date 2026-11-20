import { doublePrecision, integer, numeric, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { userRole } from "./enums";

export const users = pgTable("users", {
  id: id(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  role: userRole().notNull().default("MANAGER"),
  createdAt: createdAt(),
});

// Every user is also a player (same person, separate records).
export const players = pgTable("players", {
  id: id(),
  userId: uuid()
    .unique()
    .references(() => users.id),
  displayName: text().notNull(),
  pictureUrl: text(),
  bio: text(),
  // Elo-style rating; for now it drives only the fantasy price. Constants are tunable.
  rating: doublePrecision().notNull().default(1000),
  price: numeric({ precision: 4, scale: 1 }).notNull().default("5.0"),
  // Cached when a gameweek locks to keep profile pages cheap (see CLAUDE.md).
  currentStreak: integer().notNull().default(0),
  createdAt: createdAt(),
});

// Descriptive player attributes (scorer, talisman, ...). Set only by SUPER_ADMIN
// (enforced at the API boundary). Not used to sort teams for now; see "Deferred" in
// CLAUDE.md.
export const traits = pgTable("traits", {
  id: id(),
  name: text().notNull().unique(),
  category: text().notNull(),
});

export const playerTraits = pgTable(
  "player_traits",
  {
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    traitId: uuid()
      .notNull()
      .references(() => traits.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.traitId] })],
);
