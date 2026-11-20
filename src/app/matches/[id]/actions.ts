"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodType } from "zod";
import { getDb } from "@/db/client";
import {
  changeEventPlayerSchema, eventActionSchema, gameweekActionSchema, matchActionSchema,
} from "@/lib/schemas";
import type { Actor } from "@/server/actor";
import { requireUser, toActor } from "@/server/current-user";
import { ForbiddenError, NotFoundError, ScoringError } from "@/server/errors";
import {
  changeEventPlayer, claimScoring, lockGameweek, reconcileMatch, releaseScoring, voidEvent,
} from "@/server/scoring";

/**
 * Shared shape of the match-page actions: validate, run as the signed-in user, return to
 * the match page with a notice or an error code. Services enforce the rules.
 */
async function matchAction<T extends { matchId?: string }>(
  formData: FormData,
  schema: ZodType<T>,
  matchIdOf: (input: T) => string,
  notice: string,
  change: (actor: Actor, input: T) => Promise<unknown>,
): Promise<void> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gameweeks?error=invalid");
  const page = `/matches/${matchIdOf(parsed.data)}`;

  try {
    await change(toActor(user), parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(`${page}?error=forbidden`);
    if (error instanceof ScoringError) redirect(`${page}?error=score-${error.code}`);
    if (error instanceof NotFoundError) redirect("/gameweeks?error=invalid");
    throw error;
  }
  revalidatePath(page);
  redirect(`${page}?saved=${notice}`);
}

const idOf = (input: { matchId?: string }) => input.matchId!;

export async function claimScoringAction(formData: FormData): Promise<void> {
  await matchAction(formData, matchActionSchema, idOf, "scoring", (actor, i) => claimScoring(getDb(), actor, i.matchId));
}

export async function releaseScoringAction(formData: FormData): Promise<void> {
  await matchAction(formData, matchActionSchema, idOf, "released", (actor, i) => releaseScoring(getDb(), actor, i.matchId));
}

export async function voidEventAction(formData: FormData): Promise<void> {
  await matchAction(formData, eventActionSchema, idOf, "event", (actor, i) => voidEvent(getDb(), actor, i));
}

export async function changePlayerAction(formData: FormData): Promise<void> {
  await matchAction(formData, changeEventPlayerSchema, idOf, "event", (actor, i) => changeEventPlayer(getDb(), actor, i));
}

export async function reconcileAction(formData: FormData): Promise<void> {
  await matchAction(formData, matchActionSchema, idOf, "reconciled", (actor, i) => reconcileMatch(getDb(), actor, i.matchId));
}

export async function lockGameweekAction(formData: FormData): Promise<void> {
  await matchAction(formData, gameweekActionSchema.required({ matchId: true }), idOf, "gameweek-locked", (actor, i) =>
    lockGameweek(getDb(), actor, i.gameweekId),
  );
}
