/**
 * Fantasy squads, weekly lineups and transfers.
 *
 * A squad is 4 starters + 2 bench (SQUAD) bought within FANTASY_BUDGET at current prices.
 * Lineups are per gameweek and frozen when teams lock (the lineup deadline equals the
 * lock). Every squad change goes through createSquad or transferPlayer, and each makes
 * sure the next open gameweek has a lineup, so a gameweek that nobody touched can
 * simply copy the previous lineup when it freezes.
 */
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import {
  fantasyLineupPlayers, fantasyLineups, fantasySquadPlayers, fantasySquads, gameweeks, players, seasons, transfers,
} from "@/db/schema";
import { FANTASY_BUDGET, SQUAD, TRANSFERS_PER_GAMEWEEK } from "@/lib/constants";
import { areTeamsLocked, teamsLockAt } from "@/lib/gameweek";
import { fromTenths, toTenths } from "@/lib/rating";
import type { Actor } from "./actor";
import { isUniqueViolation } from "./db-errors";
import { FantasyError } from "./errors";

const SQUAD_SIZE = SQUAD.STARTERS + SQUAD.BENCH;

export interface LineupEntry {
  playerId: string;
  slot: "STARTER" | "BENCH";
  benchOrder: number | null;
  isCaptain: boolean;
}

/** The newest season, which is the one fantasy is played in. */
export async function getCurrentSeason(db: DbExecutor) {
  const [season] = await db.select().from(seasons).orderBy(desc(seasons.startsOn)).limit(1);
  return season ?? null;
}

/** The first gameweek of the season whose lock has not passed: where changes apply. */
export async function getOpenGameweek(db: DbExecutor, seasonId: string, now = new Date()) {
  const upcoming = await db.select().from(gameweeks).where(eq(gameweeks.seasonId, seasonId)).orderBy(asc(gameweeks.kickoffAt));
  return upcoming.find((gameweek) => !areTeamsLocked(gameweek.kickoffAt, now)) ?? null;
}

/** A user's squad for a season, with its players and what they cost today. */
export async function getSquad(db: DbExecutor, userId: string, seasonId: string) {
  const [squad] = await db
    .select()
    .from(fantasySquads)
    .where(and(eq(fantasySquads.userId, userId), eq(fantasySquads.seasonId, seasonId)));
  if (!squad) return null;

  const members = await db
    .select({ id: players.id, displayName: players.displayName, price: players.price, rating: players.rating })
    .from(fantasySquadPlayers)
    .innerJoin(players, eq(players.id, fantasySquadPlayers.playerId))
    .where(eq(fantasySquadPlayers.squadId, squad.id))
    .orderBy(desc(players.price), asc(players.displayName));
  return { ...squad, bank: Number(squad.bank), players: members.map((m) => ({ ...m, price: Number(m.price) })) };
}

async function requireSquad(db: DbExecutor, actor: Actor, seasonId: string) {
  const squad = await getSquad(db, actor.userId, seasonId);
  if (!squad) throw new FantasyError("no-squad", "You don't have a squad yet");
  return squad;
}

/** A sensible lineup for a squad with none: the four dearest start, captain is the dearest. */
function defaultLineup(squadPlayers: readonly { id: string }[]): LineupEntry[] {
  return squadPlayers.map((player, index) => ({
    playerId: player.id,
    slot: index < SQUAD.STARTERS ? "STARTER" : "BENCH",
    benchOrder: index < SQUAD.STARTERS ? null : index - SQUAD.STARTERS + 1,
    isCaptain: index === 0,
  }));
}

async function readLineup(db: DbExecutor, lineupId: string): Promise<LineupEntry[]> {
  return db
    .select({
      playerId: fantasyLineupPlayers.playerId,
      slot: fantasyLineupPlayers.slot,
      benchOrder: fantasyLineupPlayers.benchOrder,
      isCaptain: fantasyLineupPlayers.isCaptain,
    })
    .from(fantasyLineupPlayers)
    .where(eq(fantasyLineupPlayers.lineupId, lineupId));
}

async function writeLineup(db: DbExecutor, squadId: string, gameweekId: string, entries: readonly LineupEntry[]) {
  const [lineup] = await db
    .insert(fantasyLineups)
    .values({ squadId, gameweekId })
    .onConflictDoUpdate({ target: [fantasyLineups.squadId, fantasyLineups.gameweekId], set: { points: null } })
    .returning({ id: fantasyLineups.id });
  await db.delete(fantasyLineupPlayers).where(eq(fantasyLineupPlayers.lineupId, lineup!.id));
  await db.insert(fantasyLineupPlayers).values(entries.map((entry) => ({ lineupId: lineup!.id, ...entry })));
}

/**
 * Makes sure the squad has a lineup for the gameweek: copies its most recent earlier one
 * (valid because the squad has not changed since), or starts from the default.
 */
async function ensureLineup(db: DbExecutor, squadId: string, gameweek: { id: string; seasonId: string; kickoffAt: Date }) {
  const [existing] = await db
    .select({ id: fantasyLineups.id })
    .from(fantasyLineups)
    .where(and(eq(fantasyLineups.squadId, squadId), eq(fantasyLineups.gameweekId, gameweek.id)));
  if (existing) return readLineup(db, existing.id);

  const [previous] = await db
    .select({ id: fantasyLineups.id })
    .from(fantasyLineups)
    .innerJoin(gameweeks, eq(gameweeks.id, fantasyLineups.gameweekId))
    .where(and(eq(fantasyLineups.squadId, squadId), eq(gameweeks.seasonId, gameweek.seasonId), lt(gameweeks.kickoffAt, gameweek.kickoffAt)))
    .orderBy(desc(gameweeks.kickoffAt))
    .limit(1);

  let entries: LineupEntry[];
  if (previous) {
    entries = await readLineup(db, previous.id);
  } else {
    const members = await db
      .select({ id: players.id })
      .from(fantasySquadPlayers)
      .innerJoin(players, eq(players.id, fantasySquadPlayers.playerId))
      .where(eq(fantasySquadPlayers.squadId, squadId))
      .orderBy(desc(players.price), asc(players.displayName));
    entries = defaultLineup(members);
  }
  await writeLineup(db, squadId, gameweek.id, entries);
  return entries;
}

/** The lineup that applies to a gameweek (the default if none was saved yet), for display. */
export async function getLineupForDisplay(
  db: DbExecutor,
  squad: { id: string; players: { id: string }[] },
  gameweekId: string,
): Promise<LineupEntry[]> {
  const [lineup] = await db
    .select({ id: fantasyLineups.id })
    .from(fantasyLineups)
    .where(and(eq(fantasyLineups.squadId, squad.id), eq(fantasyLineups.gameweekId, gameweekId)));
  return lineup ? readLineup(db, lineup.id) : defaultLineup(squad.players);
}

/**
 * Builds a squad within the budget. Needs a season; the first lineup is the default and
 * applies from the next open gameweek.
 */
export async function createSquad(
  db: DbExecutor,
  actor: Actor,
  input: { seasonId: string; playerIds: string[] },
  now = new Date(),
): Promise<void> {
  const ids = [...new Set(input.playerIds)];
  if (ids.length !== SQUAD_SIZE || input.playerIds.length !== SQUAD_SIZE) {
    throw new FantasyError("squad-invalid", `Pick exactly ${SQUAD_SIZE} different players`);
  }

  await db.transaction(async (tx) => {
    const [season] = await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, input.seasonId));
    if (!season) throw new FantasyError("no-gameweek", "There is no season yet");

    const chosen = await tx.select({ id: players.id, price: players.price }).from(players).where(sql`${players.id} IN ${ids}`);
    if (chosen.length !== SQUAD_SIZE) throw new FantasyError("squad-invalid", "Some of those players don't exist");
    const cost = chosen.reduce((sum, p) => sum + toTenths(p.price), 0);
    if (cost > toTenths(FANTASY_BUDGET)) {
      throw new FantasyError("over-budget", `Over budget by ${fromTenths(cost - toTenths(FANTASY_BUDGET)).toFixed(1)}M`);
    }

    let squadId: string;
    try {
      // Nested transaction = savepoint, so a duplicate rolls back cleanly.
      [{ id: squadId }] = (await tx.transaction((inner) =>
        inner
          .insert(fantasySquads)
          .values({ userId: actor.userId, seasonId: input.seasonId, bank: fromTenths(toTenths(FANTASY_BUDGET) - cost).toFixed(1) })
          .returning({ id: fantasySquads.id }),
      )) as [{ id: string }];
    } catch (error) {
      if (isUniqueViolation(error)) throw new FantasyError("squad-exists", "You already have a squad this season");
      throw error;
    }
    await tx.insert(fantasySquadPlayers).values(ids.map((playerId) => ({ squadId, playerId })));

    const open = await getOpenGameweek(tx, input.seasonId, now);
    if (open) await ensureLineup(tx, squadId, open);
  });
}

/**
 * Saves the lineup for a gameweek that has not locked: who starts, the bench order (first
 * entry comes on first) and the captain, who must be a starter.
 */
export async function setLineup(
  db: DbExecutor,
  actor: Actor,
  input: { gameweekId: string; starterIds: string[]; benchIds: string[]; captainId: string },
  now = new Date(),
): Promise<void> {
  const [gameweek] = await db.select().from(gameweeks).where(eq(gameweeks.id, input.gameweekId));
  if (!gameweek) throw new FantasyError("no-gameweek", "No such gameweek");
  if (areTeamsLocked(gameweek.kickoffAt, now)) throw new FantasyError("lineup-locked", "This gameweek has locked");
  const squad = await requireSquad(db, actor, gameweek.seasonId);

  const chosen = [...input.starterIds, ...input.benchIds];
  const inSquad = new Set(squad.players.map((p) => p.id));
  if (
    input.starterIds.length !== SQUAD.STARTERS ||
    input.benchIds.length !== SQUAD.BENCH ||
    new Set(chosen).size !== SQUAD_SIZE ||
    !chosen.every((id) => inSquad.has(id)) ||
    !input.starterIds.includes(input.captainId)
  ) {
    throw new FantasyError("squad-invalid", "A lineup needs 4 starters, 2 bench players from your squad, and a starting captain");
  }

  await writeLineup(db, squad.id, gameweek.id, [
    ...input.starterIds.map((playerId) => ({ playerId, slot: "STARTER" as const, benchOrder: null, isCaptain: playerId === input.captainId })),
    ...input.benchIds.map((playerId, index) => ({ playerId, slot: "BENCH" as const, benchOrder: index + 1, isCaptain: false })),
  ]);
}

/**
 * Swaps one player for another: one transfer per gameweek, applied to the next open
 * gameweek. The outgoing player is sold and the incoming one bought at today's prices;
 * the lineup keeps the incoming player in the outgoing player's place.
 */
export async function transferPlayer(
  db: DbExecutor,
  actor: Actor,
  input: { seasonId: string; playerOutId: string; playerInId: string },
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const squad = await requireSquad(tx, actor, input.seasonId);
    const open = await getOpenGameweek(tx, input.seasonId, now);
    if (!open) throw new FantasyError("no-gameweek", "There is no upcoming gameweek to transfer for");

    const outgoing = squad.players.find((p) => p.id === input.playerOutId);
    if (!outgoing || squad.players.some((p) => p.id === input.playerInId)) {
      throw new FantasyError("squad-invalid", "Pick a player from your squad to sell and one from outside it to buy");
    }
    const [incoming] = await tx.select({ id: players.id, price: players.price }).from(players).where(eq(players.id, input.playerInId));
    if (!incoming) throw new FantasyError("squad-invalid", "No such player");

    const bank = toTenths(squad.bank) + toTenths(outgoing.price) - toTenths(incoming.price);
    if (bank < 0) throw new FantasyError("over-budget", `You need ${fromTenths(-bank).toFixed(1)}M more for that transfer`);

    try {
      // Unique per squad and gameweek: this is what enforces the transfer limit.
      await tx.transaction((inner) =>
        inner.insert(transfers).values({ squadId: squad.id, gameweekId: open.id, playerOutId: outgoing.id, playerInId: incoming.id }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new FantasyError("transfer-used", `You can make ${TRANSFERS_PER_GAMEWEEK} transfer per gameweek`);
      }
      throw error;
    }

    // Copy the lineup first (while it still matches the old squad), then swap the player.
    const entries = await ensureLineup(tx, squad.id, open);
    await tx
      .update(fantasySquadPlayers)
      .set({ playerId: incoming.id })
      .where(and(eq(fantasySquadPlayers.squadId, squad.id), eq(fantasySquadPlayers.playerId, outgoing.id)));
    await tx.update(fantasySquads).set({ bank: fromTenths(bank).toFixed(1) }).where(eq(fantasySquads.id, squad.id));
    await writeLineup(tx, squad.id, open.id, entries.map((e) => (e.playerId === outgoing.id ? { ...e, playerId: incoming.id } : e)));
  });
}

/** Whether the squad has already used its transfer for the gameweek. */
export async function hasTransferFor(db: DbExecutor, squadId: string, gameweekId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: transfers.id })
    .from(transfers)
    .where(and(eq(transfers.squadId, squadId), eq(transfers.gameweekId, gameweekId)));
  return Boolean(row);
}

/** Players a manager could buy, dearest first. */
export async function listMarket(db: DbExecutor) {
  const rows = await db
    .select({ id: players.id, displayName: players.displayName, price: players.price, rating: players.rating })
    .from(players)
    .orderBy(desc(players.price), asc(players.displayName));
  return rows.map((row) => ({ ...row, price: Number(row.price) }));
}

/**
 * Freezes every squad's lineup for a gameweek whose lock has passed: squads that never
 * saved one copy their previous lineup. Squads created after the lock are skipped.
 */
export async function freezeLineups(db: DbExecutor, gameweekId: string): Promise<void> {
  const [gameweek] = await db.select().from(gameweeks).where(eq(gameweeks.id, gameweekId));
  if (!gameweek) return;
  const lockAt = teamsLockAt(gameweek.kickoffAt);

  const squads = await db
    .select({ id: fantasySquads.id, createdAt: fantasySquads.createdAt })
    .from(fantasySquads)
    .where(eq(fantasySquads.seasonId, gameweek.seasonId));
  for (const squad of squads) {
    if (squad.createdAt <= lockAt) await ensureLineup(db, squad.id, gameweek);
  }
}
