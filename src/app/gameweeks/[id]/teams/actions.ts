"use server";

import { getDb } from "@/db/client";
import { addMatchSchema, assignPlayerSchema, deleteMatchSchema, unassignPlayerSchema } from "@/lib/schemas";
import { assignPlayer, createMatch, deleteMatch, unassignPlayer } from "@/server/teams";
import { runFormAction } from "../../../action-helper";

const page = (input: { gameweekId: string }) => `/gameweeks/${input.gameweekId}/teams`;

export async function addMatchAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: addMatchSchema, page, notice: "teams", change: (actor, i) => createMatch(getDb(), actor, i.gameweekId) });
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: deleteMatchSchema, page, notice: "teams", change: (actor, i) => deleteMatch(getDb(), actor, i.matchId) });
}

export async function assignPlayerAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: assignPlayerSchema, page, notice: "teams", change: (actor, i) => assignPlayer(getDb(), actor, i) });
}

export async function unassignPlayerAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: unassignPlayerSchema, page, notice: "teams", change: (actor, i) => unassignPlayer(getDb(), actor, i) });
}
