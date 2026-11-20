import { doublePrecision, index, integer, numeric, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "./columns";
import { userRole } from "./enums";

export const users = pgTable("users", {
  id: id(),
  email: text().notNull().unique(),
  // Normalized +E.164 (see lib/phone.ts); optional so accounts made before phone login still work.
  phone: text().unique(),
  passwordHash: text().notNull(),
  role: userRole().notNull().default("MANAGER"),
  createdAt: createdAt(),
});

// Login sessions. Only a hash of the cookie token is stored, so a leaked database
// cannot be used to impersonate anyone. Deleting a row logs that device out.
export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamptz().notNull(),
  createdAt: createdAt(),
});

// Registration is invite-only: an organizer creates an invite, shares the link, and the
// invitee's registration consumes it. Only a hash of the link token is stored.
export const invites = pgTable("invites", {
  id: id(),
  tokenHash: text().notNull().unique(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  expiresAt: timestamptz().notNull(),
  usedAt: timestamptz(),
  usedBy: uuid().references(() => users.id),
  createdAt: createdAt(),
});

// Recent failed sign-ins, keyed by the identifier typed (lowercased email or normalized
// phone), used to lock an account against password guessing. Rows are short-lived.
export const loginFailures = pgTable(
  "login_failures",
  {
    id: id(),
    identifier: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.identifier, t.createdAt)],
);

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
  price: numeric({ precision: 4, scale: 1 }).notNull().default("8.0"), // millions; see PRICE in constants.ts
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
