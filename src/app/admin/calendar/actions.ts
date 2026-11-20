"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { gameweekSchema, seasonSchema } from "@/lib/schemas";
import { createGameweek, createSeason } from "@/server/calendar";
import { requireUser, toActor } from "@/server/current-user";
import { ForbiddenError, NotFoundError, SeasonExistsError } from "@/server/errors";

const PAGE = "/admin/calendar";

export async function createSeasonAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = seasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${PAGE}?error=invalid`);

  try {
    await createSeason(getDb(), toActor(user), parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(`${PAGE}?error=forbidden`);
    if (error instanceof SeasonExistsError) redirect(`${PAGE}?error=season-exists`);
    throw error;
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=season-created`);
}

export async function createGameweekAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = gameweekSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${PAGE}?error=invalid`);

  try {
    await createGameweek(getDb(), toActor(user), parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(`${PAGE}?error=forbidden`);
    if (error instanceof NotFoundError) redirect(`${PAGE}?error=invalid`);
    throw error;
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=gameweek-created`);
}
