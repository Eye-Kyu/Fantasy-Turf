/** Shared setup for integration tests that need a played match (not used by app code). */
import type { DbExecutor } from "@/db/client";
import { createGameweek, createSeason, setRsvp } from "./calendar";
import { claimScoring } from "./scoring";
import { assignPlayer, createMatch, getGameweekTeams } from "./teams";
import { makeUser } from "./test-utils";

export const kickoff = new Date("2026-11-28T13:00:00Z"); // lock 10:00Z
export const early = new Date("2026-11-28T09:00:00Z");
export const playTime = new Date("2026-11-28T14:00:00Z");
let eventCounter = 0;
export const uuid = () => `00000000-0000-4000-8000-${String(++eventCounter).padStart(12, "0")}`;

/** Organizer, a scorer, two players per team, a locked-teams match. */
export async function setupMatch(db: DbExecutor) {
  const organizer = await makeUser(db, "Organizer", "ORGANIZER");
  const scorer = await makeUser(db, "Scorer", "MANAGER");
  const season = await createSeason(db, organizer.actor, { name: `S${crypto.randomUUID().slice(0, 8)}`, startsOn: "2026-11-01" });
  const gameweek = await createGameweek(db, organizer.actor, { seasonId: season.id, kickoffAt: kickoff });
  const [a1, a2, b1, b2] = await Promise.all(["A1", "A2", "B1", "B2"].map((n) => makeUser(db, n, "MANAGER")));
  const squad = [a1!, a2!, b1!, b2!];
  for (const player of squad) {
    await setRsvp(db, player.actor, { gameweekId: gameweek.id, playerId: player.playerId, status: "GOING" }, early);
  }
  await createMatch(db, organizer.actor, gameweek.id, early);
  const [view] = await getGameweekTeams(db, gameweek.id);
  const teamA = view!.teams[0]!;
  const teamB = view!.teams[1]!;
  for (const [player, team] of [[a1!, teamA], [a2!, teamA], [b1!, teamB], [b2!, teamB]] as const) {
    await assignPlayer(db, organizer.actor, { teamId: team.id, playerId: player.playerId }, early);
  }
  const matchId = view!.id;
  await claimScoring(db, scorer.actor, matchId, playTime);
  return { organizer, scorer, gameweek, matchId, teamA: teamA.id, teamB: teamB.id, a1: a1!, a2: a2!, b1: b1!, b2: b2! };
}

export const goalInput = (matchId: string, playerId: string, clientId = uuid()) =>
  ({ matchId, clientId, type: "GOAL" as const, playerId, relatedClientId: null, occurredAt: playTime });

