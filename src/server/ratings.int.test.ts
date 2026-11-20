import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { players } from "@/db/schema";
import { RATING } from "@/lib/constants";
import { confirmAttendance } from "./calendar";
import { issueFine, createViolation, listViolations } from "./fines";
import { goalInput, playTime, setupMatch as setup, uuid } from "./match-test-utils";
import { lockGameweek, reconcileMatch, recordEvent } from "./scoring";
import { withRollback } from "./test-utils";

const playerOf = async (db: Parameters<typeof setup>[0], id: string) =>
  (await db.select().from(players).where(eq(players.id, id)))[0]!;

describe("ratings after a gameweek locks", () => {
  it("moves ratings and prices by form, and only once", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      for (const p of [s.a1, s.a2, s.b1]) {
        await confirmAttendance(db, s.organizer.actor, { gameweekId: s.gameweek.id, playerId: p.playerId, attended: true });
      }
      // b2 said Going and never turned up; the scorer and organizer did not RSVP at all.
      const g = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, g), playTime);
      await recordEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: uuid(), type: "ASSIST", playerId: s.a2.playerId, relatedClientId: g, occurredAt: playTime }, playTime);
      await createViolation(db, s.organizer.actor, { name: "Rating test", defaultPoints: 2 });
      const [violation] = (await listViolations(db)).filter((v) => v.name === "Rating test");
      await issueFine(db, s.organizer.actor, { gameweekId: s.gameweek.id, violationTypeId: violation!.id, playerId: s.b1.playerId });

      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);

      expect(await playerOf(db, s.a1.playerId)).toMatchObject({ rating: 1000 + RATING.PLAYED + RATING.GOAL, currentStreak: 1 });
      expect((await playerOf(db, s.a1.playerId)).price).toBe("8.3"); // 1014 → 8.28 → 8.3
      expect((await playerOf(db, s.a2.playerId)).rating).toBe(1000 + RATING.PLAYED + RATING.ASSIST);
      expect((await playerOf(db, s.b1.playerId)).rating).toBe(1000 + RATING.PLAYED + 2 * RATING.PER_FINE_POINT);
      expect(await playerOf(db, s.b2.playerId)).toMatchObject({ rating: 1000 + RATING.NO_SHOW_AFTER_GOING, currentStreak: 0 });
      expect((await playerOf(db, s.scorer.playerId)).rating).toBe(1000 + RATING.ABSENT);
    }));

  it("builds a streak over gameweeks and breaks it on a miss", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await confirmAttendance(db, s.organizer.actor, { gameweekId: s.gameweek.id, playerId: s.a1.playerId, attended: true });
      await db.update(players).set({ currentStreak: 3 }).where(eq(players.id, s.a1.playerId));
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);
      // played + streak bonus min(3*2, 8) = 6
      expect(await playerOf(db, s.a1.playerId)).toMatchObject({ rating: 1000 + RATING.PLAYED + 6, currentStreak: 4 });
      expect((await playerOf(db, s.a2.playerId)).currentStreak).toBe(0);
    }));
});
