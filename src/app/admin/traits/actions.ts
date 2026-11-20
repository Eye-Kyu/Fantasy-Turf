"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { traitSchema } from "@/lib/schemas";
import { requireUser, toActor } from "@/server/current-user";
import { ForbiddenError, TraitExistsError } from "@/server/errors";
import { createTrait } from "@/server/players";

/** Adds a trait to the catalog. Super admin only (enforced by the service). */
export async function createTraitAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = traitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/traits?error=invalid");

  try {
    await createTrait(getDb(), toActor(user), parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/admin/traits?error=forbidden");
    if (error instanceof TraitExistsError) redirect("/admin/traits?error=trait-exists");
    throw error;
  }
  revalidatePath("/admin/traits");
  redirect("/admin/traits?saved=trait-created");
}
