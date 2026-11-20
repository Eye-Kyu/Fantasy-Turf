"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { loginSchema, registerSchema } from "@/lib/schemas";
import { authenticate, registerAccount } from "@/server/accounts";
import { endSession, startSession } from "@/server/current-user";
import { EmailTakenError, InvalidInviteError, PhoneTakenError, TooManyAttemptsError } from "@/server/errors";

export async function registerAction(formData: FormData): Promise<void> {
  const inviteToken = String(formData.get("inviteToken") ?? "");
  // Keep the invite in the URL so the form is still usable after an error.
  const back = (error: string) => redirect(`/register?invite=${encodeURIComponent(inviteToken)}&error=${error}`);

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const phoneProblem = parsed.error.issues.some((issue) => issue.path[0] === "phone");
    return back(phoneProblem ? "phone-invalid" : "invalid");
  }

  let userId: string;
  try {
    ({ userId } = await registerAccount(getDb(), parsed.data));
  } catch (error) {
    if (error instanceof EmailTakenError) return back("email-taken");
    if (error instanceof PhoneTakenError) return back("phone-taken");
    if (error instanceof InvalidInviteError) redirect("/register?error=invite-invalid");
    throw error;
  }
  await startSession(userId);
  redirect("/");
}

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=credentials");

  let user;
  try {
    user = await authenticate(getDb(), parsed.data.identifier, parsed.data.password);
  } catch (error) {
    if (error instanceof TooManyAttemptsError) redirect("/login?error=locked");
    throw error;
  }
  if (!user) redirect("/login?error=credentials");

  await startSession(user.userId);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
