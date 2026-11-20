import { boolean, date, doublePrecision, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "./columns";
import { rsvpStatus } from "./enums";
import { players } from "./people";

export const seasons = pgTable("seasons", {
  id: id(),
  name: text().notNull().unique(),
  startsOn: date().notNull(),
  endsOn: date(),
});

export const gameweeks = pgTable(
  "gameweeks",
  {
    id: id(),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    // Kick-off of the first match. Game-day teams lock, RSVPs close and fantasy lineups
    // freeze at kickoffAt minus TEAM_LOCK_HOURS_BEFORE_KICKOFF (derived in
    // src/lib/gameweek.ts, not stored).
    kickoffAt: timestamptz().notNull(),
    // Set when reconciliation is confirmed; later edits need an OVERRIDE audit.
    lockedAt: timestamptz(),
  },
  (t) => [unique().on(t.seasonId, t.number)],
);

export const attendances = pgTable(
  "attendances",
  {
    id: id(),
    gameweekId: uuid()
      .notNull()
      .references(() => gameweeks.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    rsvp: rsvpStatus().notNull().default("NO_RESPONSE"),
    // Confirmed by the organizer on game day; only attended players can score.
    attended: boolean().notNull().default(false),
  },
  (t) => [unique().on(t.gameweekId, t.playerId)],
);

export const playerRatings = pgTable(
  "player_ratings",
  {
    id: id(),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    gameweekId: uuid()
      .notNull()
      .references(() => gameweeks.id, { onDelete: "cascade" }),
    rating: doublePrecision().notNull(),
    delta: doublePrecision().notNull(),
    // What the rating and streak were before this gameweek, so it can be recalculated
    // if a correction changes the result after the lock.
    ratingBefore: doublePrecision(),
    streakBefore: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.playerId, t.gameweekId)],
);
