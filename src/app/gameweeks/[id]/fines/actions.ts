"use server";

import { getDb } from "@/db/client";
import { issueFineSchema, voidFineSchema } from "@/lib/schemas";
import { issueFine, voidFine } from "@/server/fines";
import { runFormAction } from "../../../action-helper";

const page = (input: { gameweekId: string }) => `/gameweeks/${input.gameweekId}/fines`;

export async function issueFineAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: issueFineSchema, page, notice: "fine-issued", change: (actor, i) => issueFine(getDb(), actor, i) });
}

export async function voidFineAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: voidFineSchema, page, notice: "fine-voided", change: (actor, i) => voidFine(getDb(), actor, i.fineId) });
}
