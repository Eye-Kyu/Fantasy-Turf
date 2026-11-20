"use server";

import { getDb } from "@/db/client";
import { changeEventPlayerSchema, eventActionSchema, gameweekActionSchema, matchActionSchema } from "@/lib/schemas";
import {
  changeEventPlayer, claimScoring, lockGameweek, reconcileMatch, releaseScoring, voidEvent,
} from "@/server/scoring";
import { runFormAction } from "../../action-helper";

const page = (input: { matchId?: string }) => `/matches/${input.matchId}`;
const lockSchema = gameweekActionSchema.required({ matchId: true });

export async function claimScoringAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: matchActionSchema, page, notice: "scoring", change: (actor, i) => claimScoring(getDb(), actor, i.matchId) });
}

export async function releaseScoringAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: matchActionSchema, page, notice: "released", change: (actor, i) => releaseScoring(getDb(), actor, i.matchId) });
}

export async function voidEventAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: eventActionSchema, page, notice: "event", change: (actor, i) => voidEvent(getDb(), actor, i) });
}

export async function changePlayerAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: changeEventPlayerSchema, page, notice: "event", change: (actor, i) => changeEventPlayer(getDb(), actor, i) });
}

export async function reconcileAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: matchActionSchema, page, notice: "reconciled", change: (actor, i) => reconcileMatch(getDb(), actor, i.matchId) });
}

export async function lockGameweekAction(formData: FormData): Promise<void> {
  await runFormAction(formData, { schema: lockSchema, page, notice: "gameweek-locked", change: (actor, i) => lockGameweek(getDb(), actor, i.gameweekId) });
}
