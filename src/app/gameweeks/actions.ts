"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { attendanceSchema, rsvpSchema } from "@/lib/schemas";
import { confirmAttendance, setRsvp } from "@/server/calendar";
import { requireUser, toActor } from "@/server/current-user";
import { ForbiddenError, NotFoundError, RsvpClosedError } from "@/server/errors";

/** Sends the user back to the gameweek page with a notice or error code. */
function backTo(gameweekId: string, query: string): never {
  revalidatePath(`/gameweeks/${gameweekId}`);
  redirect(`/gameweeks/${gameweekId}?${query}`);
}

/** Saves an RSVP: your own, or (organizers) another player's. */
export async function rsvpAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = rsvpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gameweeks?error=invalid");
  const { gameweekId, status } = parsed.data;

  const playerId = parsed.data.playerId ?? user.playerId;
  if (!playerId) backTo(gameweekId, "error=invalid");

  try {
    await setRsvp(getDb(), toActor(user), { gameweekId, playerId, status });
  } catch (error) {
    if (error instanceof RsvpClosedError) backTo(gameweekId, "error=rsvp-closed");
    if (error instanceof ForbiddenError) backTo(gameweekId, "error=forbidden");
    if (error instanceof NotFoundError) redirect("/gameweeks?error=invalid");
    throw error;
  }
  backTo(gameweekId, "saved=rsvp");
}

/** Marks a player as having turned up (or not). Organizers only. */
export async function attendanceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = attendanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gameweeks?error=invalid");

  try {
    await confirmAttendance(getDb(), toActor(user), parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) backTo(parsed.data.gameweekId, "error=forbidden");
    if (error instanceof NotFoundError) redirect("/gameweeks?error=invalid");
    throw error;
  }
  backTo(parsed.data.gameweekId, "saved=attendance");
}
