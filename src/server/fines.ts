/**
 * Manual fines and the violation catalog. A fine is a deduction in points issued by an
 * organizer; it is voided, never deleted, and the points are copied from the catalog at
 * issue time so editing the catalog never rewrites past scores.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbExecutor } from "@/db/client";
import { fines, gameweeks, matches, players, users, violationTypes } from "@/db/schema";
import { DEFAULT_VIOLATIONS } from "@/lib/violations";
import { type Actor, assertCan } from "./actor";
import { isUniqueViolation } from "./db-errors";
import { InvalidFineError, NotFoundError, ViolationExistsError } from "./errors";

/** Adds any default violation that is not in the catalog yet; existing ones are untouched. */
export async function seedDefaultViolations(db: DbExecutor, actor: Actor): Promise<number> {
  assertCan(actor, "manageViolations");
  const inserted = await db
    .insert(violationTypes)
    .values(DEFAULT_VIOLATIONS.map((v) => ({ name: v.name, description: v.description, defaultPoints: v.defaultPoints })))
    .onConflictDoNothing({ target: violationTypes.name })
    .returning({ id: violationTypes.id });
  return inserted.length;
}

export async function listViolations(db: DbExecutor, options: { activeOnly?: boolean } = {}) {
  const query = db.select().from(violationTypes);
  const rows = options.activeOnly ? query.where(eq(violationTypes.isActive, true)) : query;
  return rows.orderBy(asc(violationTypes.defaultPoints), asc(violationTypes.name));
}

export async function createViolation(
  db: DbExecutor,
  actor: Actor,
  input: { name: string; description?: string; defaultPoints: number },
): Promise<void> {
  assertCan(actor, "manageViolations");
  try {
    // In its own (nested) transaction so a duplicate rolls back cleanly to a savepoint.
    await db.transaction((tx) => tx.insert(violationTypes).values(input));
  } catch (error) {
    if (isUniqueViolation(error)) throw new ViolationExistsError(input.name);
    throw error;
  }
}

/** Changes the suggested deduction or retires/restores a violation. Past fines keep their points. */
export async function updateViolation(
  db: DbExecutor,
  actor: Actor,
  input: { violationTypeId: string; defaultPoints: number; isActive: boolean },
): Promise<void> {
  assertCan(actor, "manageViolations");
  const updated = await db
    .update(violationTypes)
    .set({ defaultPoints: input.defaultPoints, isActive: input.isActive })
    .where(eq(violationTypes.id, input.violationTypeId))
    .returning({ id: violationTypes.id });
  if (updated.length === 0) throw new NotFoundError("Violation");
}

/**
 * Fines a player for a violation in a gameweek. `points` overrides the catalog amount.
 *
 * @throws InvalidFineError for a retired violation, or a match from another gameweek.
 */
export async function issueFine(
  db: DbExecutor,
  actor: Actor,
  input: {
    gameweekId: string;
    playerId: string;
    violationTypeId: string;
    points?: number;
    matchId?: string;
    note?: string;
  },
): Promise<void> {
  assertCan(actor, "issueFines");

  const [violation] = await db.select().from(violationTypes).where(eq(violationTypes.id, input.violationTypeId));
  if (!violation) throw new NotFoundError("Violation");
  if (!violation.isActive) throw new InvalidFineError("That violation is no longer in use");

  const [gameweek] = await db.select({ id: gameweeks.id }).from(gameweeks).where(eq(gameweeks.id, input.gameweekId));
  if (!gameweek) throw new NotFoundError("Gameweek");
  const [player] = await db.select({ id: players.id }).from(players).where(eq(players.id, input.playerId));
  if (!player) throw new NotFoundError("Player");

  if (input.matchId) {
    const [match] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.id, input.matchId), eq(matches.gameweekId, input.gameweekId)));
    if (!match) throw new InvalidFineError("That match is not part of this gameweek");
  }

  await db.insert(fines).values({
    playerId: input.playerId,
    gameweekId: input.gameweekId,
    matchId: input.matchId ?? null,
    violationTypeId: violation.id,
    points: input.points ?? violation.defaultPoints,
    note: input.note ?? null,
    issuedById: actor.userId,
  });
}

/** Voids a fine (issued by mistake, or overturned). Voiding twice is harmless. */
export async function voidFine(db: DbExecutor, actor: Actor, fineId: string, now = new Date()): Promise<void> {
  assertCan(actor, "issueFines");
  const [fine] = await db.select({ voidedAt: fines.voidedAt }).from(fines).where(eq(fines.id, fineId));
  if (!fine) throw new NotFoundError("Fine");
  if (fine.voidedAt) return;
  await db.update(fines).set({ voidedAt: now, voidedById: actor.userId }).where(eq(fines.id, fineId));
}

const issuer = alias(users, "issuer");
const issuerPlayer = alias(players, "issuer_player");

/** Fines with the names needed to display them, newest first. */
async function listFinesWhere(db: DbExecutor, where: ReturnType<typeof eq>) {
  return db
    .select({
      id: fines.id,
      playerId: fines.playerId,
      playerName: players.displayName,
      gameweekId: fines.gameweekId,
      gameweekNumber: gameweeks.number,
      violation: violationTypes.name,
      points: fines.points,
      note: fines.note,
      issuedBy: issuerPlayer.displayName,
      createdAt: fines.createdAt,
      voidedAt: fines.voidedAt,
    })
    .from(fines)
    .innerJoin(players, eq(players.id, fines.playerId))
    .innerJoin(gameweeks, eq(gameweeks.id, fines.gameweekId))
    .innerJoin(violationTypes, eq(violationTypes.id, fines.violationTypeId))
    .innerJoin(issuer, eq(issuer.id, fines.issuedById))
    .leftJoin(issuerPlayer, eq(issuerPlayer.userId, issuer.id))
    .where(where)
    .orderBy(desc(fines.createdAt));
}

export const listGameweekFines = (db: DbExecutor, gameweekId: string) => listFinesWhere(db, eq(fines.gameweekId, gameweekId));
export const listPlayerFines = (db: DbExecutor, playerId: string) => listFinesWhere(db, eq(fines.playerId, playerId));
