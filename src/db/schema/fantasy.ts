import { boolean, integer, numeric, pgTable, primaryKey, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { gameweeks, seasons } from "./calendar";
import { lineupSlot } from "./enums";
import { players, users } from "./people";

// A manager's persistent roster for one season.
export const fantasySquads = pgTable(
  "fantasy_squads",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    // Money left to spend, in millions. Starts at FANTASY_BUDGET minus the squad's price;
    // a transfer sells at the current price and buys at the current price, so price
    // moves become spendable money only when a player is sold.
    bank: numeric({ precision: 5, scale: 1 }).notNull(),
  },
  (t) => [unique().on(t.userId, t.seasonId)],
);

// Current roster membership (6 players). Starter/bench/captain live on the
// per-gameweek lineup so past gameweeks keep scoring from the lineup as it stood.
export const fantasySquadPlayers = pgTable(
  "fantasy_squad_players",
  {
    squadId: uuid()
      .notNull()
      .references(() => fantasySquads.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id),
  },
  (t) => [primaryKey({ columns: [t.squadId, t.playerId] })],
);

// Snapshot of a squad's selection for one gameweek, frozen at the lineup deadline.
export const fantasyLineups = pgTable(
  "fantasy_lineups",
  {
    id: id(),
    squadId: uuid()
      .notNull()
      .references(() => fantasySquads.id, { onDelete: "cascade" }),
    gameweekId: uuid()
      .notNull()
      .references(() => gameweeks.id, { onDelete: "cascade" }),
    // Cached when the gameweek locks.
    points: integer(),
  },
  (t) => [unique().on(t.squadId, t.gameweekId)],
);

export const fantasyLineupPlayers = pgTable(
  "fantasy_lineup_players",
  {
    lineupId: uuid()
      .notNull()
      .references(() => fantasyLineups.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id),
    slot: lineupSlot().notNull(),
    // Auto-sub priority for BENCH slots (1 = first sub); null for starters.
    benchOrder: integer(),
    isCaptain: boolean().notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.lineupId, t.playerId] })],
);

export const transfers = pgTable(
  "transfers",
  {
    id: id(),
    squadId: uuid()
      .notNull()
      .references(() => fantasySquads.id, { onDelete: "cascade" }),
    gameweekId: uuid()
      .notNull()
      .references(() => gameweeks.id),
    playerOutId: uuid()
      .notNull()
      .references(() => players.id),
    playerInId: uuid()
      .notNull()
      .references(() => players.id),
    createdAt: createdAt(),
  },
  // Enforces the 1-transfer-per-gameweek limit (TRANSFERS_PER_GAMEWEEK in
  // src/lib/constants.ts). Raising the limit means dropping this constraint.
  (t) => [unique().on(t.squadId, t.gameweekId)],
);
