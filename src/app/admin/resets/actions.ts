"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { resetRequestSchema } from "@/lib/schemas";
import { requireUser, toActor } from "@/server/current-user";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { createPasswordReset } from "@/server/password-reset";

/** Creates a reset link and shows it once (the token is never stored, only its hash). */
export async function createResetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = resetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/resets?error=invalid");
  let token: string;
  try {
    ({ token } = await createPasswordReset(getDb(), toActor(user), parsed.data.userId));
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/admin/resets?error=forbidden");
    if (error instanceof NotFoundError) redirect("/admin/resets?error=invalid");
    throw error;
  }
  redirect(`/admin/resets?token=${encodeURIComponent(token)}&for=${encodeURIComponent(parsed.data.userId)}`);
}
