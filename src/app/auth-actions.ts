"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { loginSchema, registerSchema } from "@/lib/schemas";
import { authenticate, registerAccount } from "@/server/accounts";
import { endSession, startSession } from "@/server/current-user";
import { EmailTakenError } from "@/server/errors";

export async function registerAction(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/register?error=invalid");

  let userId: string;
  try {
    ({ userId } = await registerAccount(getDb(), parsed.data));
  } catch (error) {
    if (error instanceof EmailTakenError) redirect("/register?error=email-taken");
    throw error;
  }
  await startSession(userId);
  redirect("/");
}

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=credentials");

  const user = await authenticate(getDb(), parsed.data.email, parsed.data.password);
  if (!user) redirect("/login?error=credentials");

  await startSession(user.userId);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
