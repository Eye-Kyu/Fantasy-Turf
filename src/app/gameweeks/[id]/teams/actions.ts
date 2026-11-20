"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodType } from "zod";
import { getDb } from "@/db/client";
import { addMatchSchema, assignPlayerSchema, deleteMatchSchema, unassignPlayerSchema } from "@/lib/schemas";
import { requireUser, toActor } from "@/server/current-user";
import { ForbiddenError, NotFoundError, PlayerNotGoingError, TeamsLockedError } from "@/server/errors";
import { assignPlayer, createMatch, deleteMatch, unassignPlayer } from "@/server/teams";
import type { Actor } from "@/server/actor";

/**
 * Shared shape of every sorting action: validate the form, run the change as the
 * signed-in user, and return to the teams page with a notice or an error code. The
 * services enforce who may sort and the lock; this only translates their errors.
 */
async function sortingAction<T extends { gameweekId: string }>(
  formData: FormData,
  schema: ZodType<T>,
  change: (actor: Actor, input: T) => Promise<unknown>,
): Promise<void> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gameweeks?error=invalid");
  const page = `/gameweeks/${parsed.data.gameweekId}/teams`;

  try {
    await change(toActor(user), parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(`${page}?error=forbidden`);
    if (error instanceof TeamsLockedError) redirect(`${page}?error=teams-locked`);
    if (error instanceof PlayerNotGoingError) redirect(`${page}?error=not-going`);
    if (error instanceof NotFoundError) redirect(`${page}?error=invalid`);
    throw error;
  }
  revalidatePath(page);
  redirect(`${page}?saved=teams`);
}

export async function addMatchAction(formData: FormData): Promise<void> {
  await sortingAction(formData, addMatchSchema, (actor, i) => createMatch(getDb(), actor, i.gameweekId));
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  await sortingAction(formData, deleteMatchSchema, (actor, i) => deleteMatch(getDb(), actor, i.matchId));
}

export async function assignPlayerAction(formData: FormData): Promise<void> {
  await sortingAction(formData, assignPlayerSchema, (actor, i) => assignPlayer(getDb(), actor, i));
}

export async function unassignPlayerAction(formData: FormData): Promise<void> {
  await sortingAction(formData, unassignPlayerSchema, (actor, i) => unassignPlayer(getDb(), actor, i));
}
