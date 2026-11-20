"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { profileSchema } from "@/lib/schemas";
import { ForbiddenError } from "@/server/errors";
import { requireUser, toActor } from "@/server/current-user";
import { setPlayerTraits, updateOwnProfile } from "@/server/players";

/** Saves the signed-in user's own profile. */
export async function updateProfileAction(playerId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/players/${playerId}?error=invalid`);

  // Only your own profile can be edited, whatever playerId the form was built with.
  if (user.playerId !== playerId) redirect(`/players/${playerId}?error=forbidden`);

  await updateOwnProfile(getDb(), toActor(user), parsed.data);
  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}?saved=profile`);
}

/** Replaces a player's traits. Super admin only (enforced by the service). */
export async function setTraitsAction(playerId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    await setPlayerTraits(getDb(), toActor(user), playerId, formData.getAll("traitIds").map(String));
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(`/players/${playerId}?error=forbidden`);
    throw error;
  }
  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}?saved=traits`);
}
