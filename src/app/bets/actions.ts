"use server";

import { getDb } from "@/db/client";
import { betSchema } from "@/lib/schemas";
import { placeBet } from "@/server/betting";
import { runFormAction } from "../action-helper";

export async function placeBetAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: betSchema, page: () => "/bets", invalidPage: "/bets", notice: "bet-placed", change: (actor, i) => placeBet(getDb(), actor, i) });
}
