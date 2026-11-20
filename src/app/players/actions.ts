"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { profileSchema } from "@/lib/schemas";
import { ForbiddenError, PictureError } from "@/server/errors";
import { MAX_PICTURE_UPLOAD_BYTES, removeOwnPicture, setOwnPicture } from "@/server/pictures";
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

/** Uploads the signed-in user's own profile picture. */
export async function uploadPictureAction(playerId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const file = formData.get("picture");
  if (!(file instanceof File) || file.size === 0) redirect(`/players/${playerId}?error=picture-invalid`);
  if (file.size > MAX_PICTURE_UPLOAD_BYTES) redirect(`/players/${playerId}?error=picture-too-large`);
  try {
    await setOwnPicture(getDb(), toActor(user), playerId, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof PictureError) redirect(`/players/${playerId}?error=picture-${error.code}`);
    throw error;
  }
  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}?saved=picture`);
}

export async function removePictureAction(playerId: string): Promise<void> {
  const user = await requireUser();
  try {
    await removeOwnPicture(getDb(), toActor(user), playerId);
  } catch (error) {
    if (error instanceof PictureError) redirect(`/players/${playerId}?error=picture-${error.code}`);
    throw error;
  }
  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}?saved=picture-removed`);
}
