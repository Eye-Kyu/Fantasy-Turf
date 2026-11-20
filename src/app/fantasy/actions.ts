"use server";

import { getDb } from "@/db/client";
import { lineupSchema, squadSchema, transferSchema } from "@/lib/schemas";
import { createSquad, setLineup, transferPlayer } from "@/server/fantasy";
import { runFormAction } from "../action-helper";

const page = () => "/fantasy";

export async function createSquadAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: squadSchema, page, invalidPage: "/fantasy", notice: "squad-created", change: (actor, i) => createSquad(getDb(), actor, i) });
}

export async function setLineupAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: lineupSchema, page, invalidPage: "/fantasy", notice: "lineup", change: (actor, i) => setLineup(getDb(), actor, i) });
}

export async function transferAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: transferSchema, page, invalidPage: "/fantasy", notice: "transfer", change: (actor, i) => transferPlayer(getDb(), actor, i) });
}
