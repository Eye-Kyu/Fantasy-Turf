import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { DbExecutor } from "@/db/client";
import { users } from "@/db/schema";
import { tallyScore } from "@/lib/match-events";
import { registerAccount } from "./accounts";
import type { Actor } from "./actor";
import { createGameweek, createSeason, setRsvp } from "./calendar";
import { ForbiddenError, ScoringError } from "./errors";
import {
  applyScoringOps, changeEventPlayer, claimScoring, getMatchView, listMatchAudit, lockGameweek,
  reconcileMatch, recordEvent, voidEvent,
} from "./scoring";
import { assignPlayer, createMatch, getGameweekTeams } from "./teams";
import { makeInviteToken, withRollback } from "./test-utils";

let counter = 0;
async function makeUser(db: DbExecutor, name: string, role: Actor["role"]) {
  const account = await registerAccount(db, {
    email: `${name.toLowerCase()}${++counter}@example.com`,
    phone: `+2547${String(700000 + counter).padStart(8, "0")}`,
    password: "a-long-password",
    displayName: name,
    inviteToken: await makeInviteToken(db),
  });
  await db.update(users).set({ role }).where(eq(users.id, account.userId));
  return { actor: { userId: account.userId, role } as Actor, playerId: account.playerId };
}

const kickoff = new Date("2026-11-28T13:00:00Z"); // lock 10:00Z
const early = new Date("2026-11-28T09:00:00Z");
const playTime = new Date("2026-11-28T14:00:00Z");
let eventCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++eventCounter).padStart(12, "0")}`;

/** Organizer, a scorer, two players per team, a locked-teams match. */
async function setup(db: DbExecutor) {
  const organizer = await makeUser(db, "Organizer", "ORGANIZER");
  const scorer = await makeUser(db, "Scorer", "MANAGER");
  const season = await createSeason(db, organizer.actor, { name: `S${counter}`, startsOn: "2026-11-01" });
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

const goalInput = (matchId: string, playerId: string, clientId = uuid()) =>
  ({ matchId, clientId, type: "GOAL" as const, playerId, relatedClientId: null, occurredAt: playTime });

async function score(db: DbExecutor, matchId: string, teams: string[]) {
  return tallyScore((await getMatchView(db, matchId)).events, teams);
}

describe("who may score", () => {
  it("opens only once teams are locked", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await expect(recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), early)).rejects.toMatchObject({ code: "not-open" });
    }));

  it("refuses a player in the match, and anyone who has not claimed scoring", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await expect(claimScoring(db, s.a1.actor, s.matchId, playTime)).rejects.toMatchObject({ code: "playing" });
      await expect(recordEvent(db, s.a1.actor, goalInput(s.matchId, s.a1.playerId), playTime)).rejects.toMatchObject({ code: "playing" });

      const bystander = await makeUser(db, "Bystander", "MANAGER");
      await expect(recordEvent(db, bystander.actor, goalInput(s.matchId, s.a1.playerId), playTime)).rejects.toMatchObject({ code: "not-scorer" });
      await expect(claimScoring(db, bystander.actor, s.matchId, playTime)).rejects.toMatchObject({ code: "scorer-taken" });
    }));

  it("lets an organizer take over scoring", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await claimScoring(db, s.organizer.actor, s.matchId, playTime);
      await recordEvent(db, s.organizer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      expect(await score(db, s.matchId, [s.teamA, s.teamB])).toEqual({ [s.teamA]: 1, [s.teamB]: 0 });
    }));
});

describe("recording events", () => {
  it("counts goals per team and ignores a retried event", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const id = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, id), playTime);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, id), playTime); // retry
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.b1.playerId), playTime);
      expect(await score(db, s.matchId, [s.teamA, s.teamB])).toEqual({ [s.teamA]: 1, [s.teamB]: 1 });
    }));

  it("validates assists", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const goalId = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, goalId), playTime);
      const assist = (playerId: string, related: string | null = goalId) =>
        recordEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: uuid(), type: "ASSIST", playerId, relatedClientId: related, occurredAt: playTime }, playTime);

      await expect(assist(s.a1.playerId)).rejects.toBeInstanceOf(ScoringError); // own goal
      await expect(assist(s.b1.playerId)).rejects.toBeInstanceOf(ScoringError); // other team
      await expect(assist(s.a2.playerId, null)).rejects.toBeInstanceOf(ScoringError); // no goal
      await assist(s.a2.playerId);
      await expect(assist(s.a2.playerId)).rejects.toBeInstanceOf(ScoringError); // second assist
    }));

  it("rejects a player who is not on a team in the match", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const stranger = await makeUser(db, "Stranger", "MANAGER");
      await expect(recordEvent(db, s.scorer.actor, goalInput(s.matchId, stranger.playerId), playTime)).rejects.toMatchObject({ code: "invalid-event" });
    }));

  it("voids an event, and a goal's assist with it, never deleting", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const goalId = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, goalId), playTime);
      await recordEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: uuid(), type: "ASSIST", playerId: s.a2.playerId, relatedClientId: goalId, occurredAt: playTime }, playTime);
      await voidEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: goalId }, playTime);
      await voidEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: goalId }, playTime); // harmless twice

      const view = await getMatchView(db, s.matchId);
      expect(view.events).toHaveLength(2);
      expect(view.events.every((e) => e.voided)).toBe(true);
      expect(tallyScore(view.events, [s.teamA])).toEqual({ [s.teamA]: 0 });
    }));

  it("applies a phone's queued batch and reports rejected operations", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const goalId = uuid();
      const results = await applyScoringOps(db, s.scorer.actor, s.matchId, [
        { kind: "add", clientId: goalId, type: "GOAL", teamId: s.teamA, playerId: s.a1.playerId, relatedClientId: null, occurredAt: playTime.toISOString() },
        { kind: "add", clientId: uuid(), type: "ASSIST", teamId: s.teamA, playerId: s.a1.playerId, relatedClientId: goalId, occurredAt: playTime.toISOString() },
        { kind: "add", clientId: goalId, type: "GOAL", teamId: s.teamA, playerId: s.a1.playerId, relatedClientId: null, occurredAt: playTime.toISOString() },
      ], playTime);
      expect(results.map((r) => r.status)).toEqual(["ok", "rejected", "ok"]);
      expect(await score(db, s.matchId, [s.teamA])).toEqual({ [s.teamA]: 1 });
    }));
});

describe("audit log", () => {
  it("records create, void and edit with who did it", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const goalId = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, goalId), playTime);
      await changeEventPlayer(db, s.organizer.actor, { matchId: s.matchId, clientId: goalId, playerId: s.a2.playerId }, playTime);
      await voidEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: goalId }, playTime);

      const log = await listMatchAudit(db, s.matchId);
      expect(log.map((r) => r.action).sort()).toEqual(["CREATE", "EDIT", "VOID"]);
      expect(log.find((r) => r.action === "EDIT")).toMatchObject({
        actorId: s.organizer.actor.userId,
        before: { playerId: s.a1.playerId },
        after: { playerId: s.a2.playerId },
      });
    }));

  it("only organizers may correct who scored, and only within the same team", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const goalId = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, goalId), playTime);
      await expect(changeEventPlayer(db, s.scorer.actor, { matchId: s.matchId, clientId: goalId, playerId: s.a2.playerId }, playTime)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(changeEventPlayer(db, s.organizer.actor, { matchId: s.matchId, clientId: goalId, playerId: s.b1.playerId }, playTime)).rejects.toMatchObject({ code: "invalid-event" });
    }));
});

describe("reconciliation and the gameweek lock", () => {
  it("needs every match reconciled before locking, and reconciling is for non-players", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await expect(lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime)).rejects.toMatchObject({ code: "not-reconciled" });
      await expect(reconcileMatch(db, s.scorer.actor, s.matchId, playTime)).rejects.toBeInstanceOf(ForbiddenError);
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);
      expect((await getMatchView(db, s.matchId)).gameweek.lockedAt).not.toBeNull();
    }));

  it("an organizer who plays in the match cannot reconcile it", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const playingOrganizer = await makeUser(db, "PlayingOrg", "ORGANIZER");
      await setRsvp(db, playingOrganizer.actor, { gameweekId: s.gameweek.id, playerId: playingOrganizer.playerId, status: "GOING" }, early);
      await assignPlayer(db, s.organizer.actor, { teamId: s.teamA, playerId: playingOrganizer.playerId }, early);
      await expect(reconcileMatch(db, playingOrganizer.actor, s.matchId, playTime)).rejects.toMatchObject({ code: "playing" });
    }));

  it("a change after reconciling asks for another review", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      expect((await getMatchView(db, s.matchId)).match.reconciledAt).toBeNull();
    }));

  it("after the lock only organizers can change events, audited as OVERRIDE", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);

      await expect(recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime)).rejects.toMatchObject({ code: "locked" });
      await recordEvent(db, s.organizer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      expect((await listMatchAudit(db, s.matchId)).map((r) => r.action)).toEqual(["OVERRIDE"]);
      expect((await getMatchView(db, s.matchId)).match.reconciledAt).not.toBeNull(); // lock keeps it reconciled
    }));
});

describe("database guards", () => {
  it("allows only one live assist per goal even if the service is bypassed", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const goalId = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, goalId), playTime);
      const { matchEvents } = await import("@/db/schema");
      const [goal] = await db.select().from(matchEvents).where(eq(matchEvents.clientId, goalId));
      const row = { matchId: s.matchId, gameDayTeamId: s.teamA, playerId: s.a2.playerId, type: "ASSIST" as const, relatedEventId: goal!.id, occurredAt: playTime };
      await db.transaction(async (tx) => {
        await tx.insert(matchEvents).values({ ...row, clientId: uuid() });
        // The nested transaction is a savepoint, so the failed insert doesn't poison the outer one.
        await expect(tx.transaction((inner) => inner.insert(matchEvents).values({ ...row, clientId: uuid() }))).rejects.toThrow();
      });
    }));
});
