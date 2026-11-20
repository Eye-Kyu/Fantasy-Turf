import { describe, expect, it } from "vitest";
import type { DbExecutor } from "@/db/client";
import { fines, seasons, violationTypes } from "@/db/schema";
import { confirmAttendance } from "./calendar";
import { goalInput, playTime, setupMatch as setup, uuid } from "./match-test-utils";
import { getGameweekPoints, getSeasonTotals } from "./points";
import { lockGameweek, reconcileMatch, recordEvent, voidEvent } from "./scoring";
import { withRollback } from "./test-utils";

type Setup = Awaited<ReturnType<typeof setup>>;

async function markHere(db: DbExecutor, s: Setup, players: { playerId: string }[]) {
  for (const p of players) {
    await confirmAttendance(db, s.organizer.actor, { gameweekId: s.gameweek.id, playerId: p.playerId, attended: true });
  }
}

const row = (rows: Awaited<ReturnType<typeof getGameweekPoints>>["rows"], playerId: string) =>
  rows.find((r) => r.playerId === playerId)!;

describe("gameweek points", () => {
  it("scores goals, assists and the team bonus for everyone who played", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await markHere(db, s, [s.a1, s.a2, s.b1, s.b2]);
      const g1 = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, g1), playTime);
      await recordEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: uuid(), type: "ASSIST", playerId: s.a2.playerId, relatedClientId: g1, occurredAt: playTime }, playTime);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime); // A leads 2-0

      const { rows, final } = await getGameweekPoints(db, s.gameweek.id);
      expect(final).toBe(false);
      expect(row(rows, s.a1.playerId)).toMatchObject({ goals: 2, eventPoints: 4, bonusPoints: 1, total: 5, matchesPlayed: 1 });
      expect(row(rows, s.a2.playerId)).toMatchObject({ assists: 1, eventPoints: 1, bonusPoints: 1, total: 2 });
      expect(row(rows, s.b1.playerId).total).toBe(0);
      expect(rows[0]!.playerId).toBe(s.a1.playerId); // best first
    }));

  it("a voided goal stops counting, and so does the bonus it created", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await markHere(db, s, [s.a1, s.a2]);
      const second = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, second), playTime);
      expect(row((await getGameweekPoints(db, s.gameweek.id)).rows, s.a2.playerId).total).toBe(1);

      await voidEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: second }, playTime);
      const { rows } = await getGameweekPoints(db, s.gameweek.id);
      expect(row(rows, s.a1.playerId).total).toBe(2);
      expect(row(rows, s.a2.playerId).total).toBe(0);
    }));

  it("does not pay a team member who was not marked here and did nothing", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await markHere(db, s, [s.a1]); // a2 never marked
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      const { rows } = await getGameweekPoints(db, s.gameweek.id);
      expect(row(rows, s.a1.playerId).bonusPoints).toBe(1);
      expect(rows.find((r) => r.playerId === s.a2.playerId)).toBeUndefined();
    }));

  it("counts someone with an event as having played, even if not marked here", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.b1.playerId), playTime);
      expect(row((await getGameweekPoints(db, s.gameweek.id)).rows, s.b1.playerId)).toMatchObject({ goals: 1, total: 2 });
    }));

  it("subtracts active fines, including from a player who did not play, and ignores voided ones", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await markHere(db, s, [s.a1]);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      const [violation] = await db.insert(violationTypes).values({ name: `V${uuid()}`, defaultPoints: 1 }).returning({ id: violationTypes.id });
      const base = { gameweekId: s.gameweek.id, violationTypeId: violation!.id, issuedById: s.organizer.actor.userId };
      await db.insert(fines).values([
        { ...base, playerId: s.a1.playerId, points: 1 },
        { ...base, playerId: s.b2.playerId, points: 3 },
        { ...base, playerId: s.b1.playerId, points: 5, voidedAt: new Date() },
      ]);

      const { rows } = await getGameweekPoints(db, s.gameweek.id);
      expect(row(rows, s.a1.playerId)).toMatchObject({ eventPoints: 2, finePoints: 1, total: 1 });
      expect(row(rows, s.b2.playerId)).toMatchObject({ matchesPlayed: 0, finePoints: 3, total: -3 });
      expect(rows.find((r) => r.playerId === s.b1.playerId)).toBeUndefined();
    }));

  it("becomes final when the gameweek is locked", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);
      expect((await getGameweekPoints(db, s.gameweek.id)).final).toBe(true);
    }));
});

describe("season totals", () => {
  it("adds a player's points across the season's gameweeks", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await markHere(db, s, [s.a1]);
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      const [season] = await db.select().from(seasons);
      const totals = await getSeasonTotals(db, season!.id);
      expect(totals.find((t) => t.playerId === s.a1.playerId)).toMatchObject({ goals: 1, total: 2, matchesPlayed: 1 });
    }));
});
