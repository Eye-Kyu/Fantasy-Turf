"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { resetPasswordSchema } from "@/lib/schemas";
import { InvalidResetError } from "@/server/errors";
import { completePasswordReset } from "@/server/password-reset";

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/reset?token=${encodeURIComponent(token)}&error=invalid`);
  try {
    await completePasswordReset(getDb(), parsed.data.token, parsed.data.password);
  } catch (error) {
    if (error instanceof InvalidResetError) redirect("/reset?error=reset-invalid");
    throw error;
  }
  redirect("/login?saved=password-reset");
}
