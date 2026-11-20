/** Player profiles and traits. Traits may only be changed by a super admin. */
import { asc, eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { playerTraits, players, traits } from "@/db/schema";
import { type Actor, assertCan } from "./actor";
import { isUniqueViolation } from "./db-errors";
import { NotFoundError, TraitExistsError } from "./errors";

export interface TraitSummary {
  id: string;
  name: string;
  category: string;
}

/** Everyone in the league, alphabetically, for the player list. */
export async function listPlayers(db: DbExecutor) {
  return db
    .select({ id: players.id, displayName: players.displayName, rating: players.rating })
    .from(players)
    .orderBy(asc(players.displayName));
}

/** A player's profile with their traits, or null if there is no such player. */
export async function getPlayerProfile(db: DbExecutor, playerId: string) {
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) return null;

  const playerTraitList: TraitSummary[] = await db
    .select({ id: traits.id, name: traits.name, category: traits.category })
    .from(playerTraits)
    .innerJoin(traits, eq(traits.id, playerTraits.traitId))
    .where(eq(playerTraits.playerId, playerId))
    .orderBy(asc(traits.category), asc(traits.name));

  return { ...player, traits: playerTraitList };
}

/** Lets a user edit their own profile (never anyone else's). */
export async function updateOwnProfile(
  db: DbExecutor,
  actor: Actor,
  changes: { displayName: string; bio: string | null },
): Promise<void> {
  const updated = await db
    .update(players)
    .set(changes)
    .where(eq(players.userId, actor.userId))
    .returning({ id: players.id });
  if (updated.length === 0) throw new NotFoundError("Player profile");
}

/** The full trait catalog. */
export async function listTraits(db: DbExecutor): Promise<TraitSummary[]> {
  return db
    .select({ id: traits.id, name: traits.name, category: traits.category })
    .from(traits)
    .orderBy(asc(traits.category), asc(traits.name));
}

/**
 * Adds a trait to the catalog. Super admin only.
 * @throws TraitExistsError if a trait with that name exists.
 */
export async function createTrait(
  db: DbExecutor,
  actor: Actor,
  input: { name: string; category: string },
): Promise<void> {
  assertCan(actor, "setTraits");
  try {
    await db.insert(traits).values(input);
  } catch (error) {
    if (isUniqueViolation(error)) throw new TraitExistsError(input.name);
    throw error;
  }
}

/** Replaces a player's traits with exactly `traitIds`. Super admin only. */
export async function setPlayerTraits(
  db: DbExecutor,
  actor: Actor,
  playerId: string,
  traitIds: string[],
): Promise<void> {
  assertCan(actor, "setTraits");
  await db.transaction(async (tx) => {
    const [player] = await tx.select({ id: players.id }).from(players).where(eq(players.id, playerId));
    if (!player) throw new NotFoundError("Player");

    await tx.delete(playerTraits).where(eq(playerTraits.playerId, playerId));
    const unique = [...new Set(traitIds)];
    if (unique.length === 0) return;

    // Only trait ids that really exist are linked; unknown ids are dropped.
    const known = await tx.select({ id: traits.id }).from(traits).where(inArray(traits.id, unique));
    if (known.length > 0) {
      await tx.insert(playerTraits).values(known.map((t) => ({ playerId, traitId: t.id })));
    }
  });
}
