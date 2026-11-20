import { check, integer, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id } from "./columns";
import { gameweeks } from "./calendar";
import { betStatus, betType } from "./enums";
import { gameDayTeams, matches } from "./matches";
import { players, users } from "./people";

// Points-based bets, built last (see "Betting" in CLAUDE.md).
export const bets = pgTable(
  "bets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameweekId: uuid()
      .notNull()
      .references(() => gameweeks.id),
    type: betType().notNull(),
    matchId: uuid()
      .notNull()
      .references(() => matches.id),
    targetPlayerId: uuid().references(() => players.id),
    targetTeamId: uuid().references(() => gameDayTeams.id),
    stake: integer().notNull(),
    status: betStatus().notNull().default("OPEN"),
    payout: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    check("bets_stake_positive", sql`${t.stake} > 0`),
    // One bet per type per match per person; the pick must match the type.
    unique().on(t.userId, t.matchId, t.type),
    check(
      "bets_pick_matches_type",
      sql`(${t.type} = 'MATCH_WINNER' AND ${t.targetTeamId} IS NOT NULL AND ${t.targetPlayerId} IS NULL) OR (${t.type} <> 'MATCH_WINNER' AND ${t.targetPlayerId} IS NOT NULL AND ${t.targetTeamId} IS NULL)`,
    ),
  ],
);
