"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { updateViolationSchema, violationSchema } from "@/lib/schemas";
import { createViolation, seedDefaultViolations, updateViolation } from "@/server/fines";
import { runFormAction } from "../../action-helper";

const PAGE = "/admin/violations";
const page = () => PAGE;

export async function seedViolationsAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: z.object({}), page, notice: "violations-seeded", change: (actor) => seedDefaultViolations(getDb(), actor) });
}

export async function createViolationAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: violationSchema, page, notice: "violation-saved", change: (actor, i) => createViolation(getDb(), actor, i) });
}

export async function updateViolationAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: updateViolationSchema, page, notice: "violation-saved", change: (actor, i) => updateViolation(getDb(), actor, i) });
}

