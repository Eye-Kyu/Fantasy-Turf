import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "./columns";
import { auditAction, eventType } from "./enums";
import { gameweeks } from "./calendar";
import { players, users } from "./people";

export const matches = pgTable(
  "matches",
  {
    id: id(),
    gameweekId: uuid()
      .notNull()
      .references(() => gameweeks.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    // Integrity: neither may be a player in this match (enforced in app code).
    liveScorerId: uuid().references(() => users.id),
    reconciledById: uuid().references(() => users.id),
    reconciledAt: timestamptz(),
    // Chosen by an organizer; worth BONUS_POINTS.MAN_OF_THE_MATCH to a player who played.
    motmPlayerId: uuid().references(() => players.id),
  },
  (t) => [unique().on(t.gameweekId, t.number)],
);

export const gameDayTeams = pgTable(
  "game_day_teams",
  {
    id: id(),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    name: text().notNull(),
  },
  (t) => [unique().on(t.matchId, t.name)],
);

export const gameDayTeamPlayers = pgTable(
  "game_day_team_players",
  {
    gameDayTeamId: uuid()
      .notNull()
      .references(() => gameDayTeams.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    // Denormalized from the team so the database itself guarantees one team per
    // player per match (see the unique constraint below).
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.gameDayTeamId, t.playerId] }),
    unique().on(t.matchId, t.playerId),
  ],
);

export const matchEvents = pgTable(
  "match_events",
  {
    id: id(),
    // Generated on the scorer's device so offline retries cannot double-count.
    clientId: uuid().notNull().unique(),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    gameDayTeamId: uuid()
      .notNull()
      .references(() => gameDayTeams.id),
    playerId: uuid()
      .notNull()
      .references(() => players.id),
    type: eventType().notNull(),
    // For ASSIST events: the GOAL this assist belongs to.
    relatedEventId: uuid().references((): AnyPgColumn => matchEvents.id),
    occurredAt: timestamptz().notNull(),
    // Voided (never deleted) so the audit trail stays intact.
    voidedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.matchId, t.occurredAt),
    // An assist always belongs to a goal, and nothing else does.
    check("assist_links_to_goal", sql`(${t.type} = 'ASSIST') = (${t.relatedEventId} IS NOT NULL)`),
    // At most one live assist per goal (a voided assist can be replaced).
    uniqueIndex("one_live_assist_per_goal")
      .on(t.relatedEventId)
      .where(sql`${t.type} = 'ASSIST' AND ${t.voidedAt} IS NULL`),
  ],
);

export const eventAuditLogs = pgTable(
  "event_audit_logs",
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => matchEvents.id, { onDelete: "cascade" }),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    action: auditAction().notNull(),
    before: jsonb(),
    after: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.eventId)],
);
