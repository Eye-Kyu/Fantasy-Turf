"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireUser, toActor } from "@/server/current-user";
import { ForbiddenError } from "@/server/errors";
import { createInvite } from "@/server/invites";

/**
 * Creates an invite and shows its link once. The token is passed in the redirect URL
 * because it is never stored (only its hash is), so this is the one chance to show it.
 */
export async function createInviteAction(): Promise<void> {
  const user = await requireUser();
  let token: string;
  try {
    ({ token } = await createInvite(getDb(), toActor(user)));
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/admin/invites?error=forbidden");
    throw error;
  }
  redirect(`/admin/invites?token=${encodeURIComponent(token)}`);
}
