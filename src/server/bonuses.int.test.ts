import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bets, players } from "@/db/schema";
import { RATING } from "@/lib/constants";
import { confirmAttendance } from "./calendar";
import { placeBet } from "./betting";
import { createViolation, issueFine, listViolations } from "./fines";
import { goalInput, playTime, setupMatch as setup } from "./match-test-utils";
import { getGameweekPoints } from "./points";
import { lockGameweek, reconcileMatch, recordEvent, setManOfTheMatch, voidEvent } from "./scoring";
import { makeUser, withRollback } from "./test-utils";

const rowOf = async (db: Parameters<typeof setup>[0], gameweekId: string, playerId: string) =>
  (await getGameweekPoints(db, gameweekId)).rows.find((r) => r.playerId === playerId);

async function attend(db: Parameters<typeof setup>[0], s: Awaited<ReturnType<typeof setup>>, list = [s.a1, s.a2, s.b1]) {
  for (const p of list) await confirmAttendance(db, s.organizer.actor, { gameweekId: s.gameweek.id, playerId: p.playerId, attended: true });
}

describe("man of the match and late drop-outs", () => {
  it("gives +5 to the man of the match who played, and -7 to a rostered no-show once reconciled", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await attend(db, s);
      await setManOfTheMatch(db, s.organizer.actor, s.matchId, s.a2.playerId);
      expect((await rowOf(db, s.gameweek.id, s.a2.playerId))?.bonusPoints).toBe(5);
      // Not reconciled yet: nobody is a drop-out.
      expect((await rowOf(db, s.gameweek.id, s.b2.playerId))?.dropoutPoints ?? 0).toBe(0);

      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      const dropout = await rowOf(db, s.gameweek.id, s.b2.playerId);
      expect(dropout).toMatchObject({ dropoutPoints: 7, matchesPlayed: 0, total: -7 });
      expect((await rowOf(db, s.gameweek.id, s.a1.playerId))?.dropoutPoints).toBe(0);
    }));

  it("refuses a man of the match who is not in the match", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const outsider = await makeUser(db, "Outsider", "MANAGER");
      await expect(setManOfTheMatch(db, s.organizer.actor, s.matchId, outsider.playerId)).rejects.toMatchObject({ code: "invalid-event" });
    }));
});

describe("corrections after the lock", () => {
  it("re-rates players and settles bets again", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      await attend(db, s);
      const g = crypto.randomUUID();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, g), playTime);
      const x = await makeUser(db, "X", "MANAGER");
      const y = await makeUser(db, "Y", "MANAGER");
      const betTime = new Date("2026-11-28T11:00:00Z");
      await placeBet(db, x.actor, { matchId: s.matchId, type: "MATCH_WINNER", pickId: s.teamA, stake: 20 }, betTime);
      await placeBet(db, y.actor, { matchId: s.matchId, type: "MATCH_WINNER", pickId: s.teamB, stake: 20 }, betTime);
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);

      const ratingOf = async (id: string) => (await db.select().from(players).where(eq(players.id, id)))[0]!.rating;
      const beforeA1 = await ratingOf(s.a1.playerId);
      expect(beforeA1).toBe(1000 + RATING.PLAYED + RATING.GOAL);
      const winnerBet = async (userId: string) => (await db.select().from(bets).where(eq(bets.userId, userId)))[0]!;
      expect(await winnerBet(x.actor.userId)).toMatchObject({ status: "WON", payout: 40 });

      // The organizer finds the goal was wrong and voids it, after the lock.
      await voidEvent(db, s.organizer.actor, { matchId: s.matchId, clientId: g }, playTime);
      expect(await ratingOf(s.a1.playerId)).toBe(1000 + RATING.PLAYED);
      // 0-0 is a draw: everyone is refunded.
      expect(await winnerBet(x.actor.userId)).toMatchObject({ status: "VOID", payout: 20 });
      expect(await winnerBet(y.actor.userId)).toMatchObject({ status: "VOID", payout: 20 });

      // A fine issued after the lock lowers the rating by 5 per point.
      await createViolation(db, s.organizer.actor, { name: "Post-lock", defaultPoints: 2 });
      const [violation] = (await listViolations(db)).filter((v) => v.name === "Post-lock");
      await issueFine(db, s.organizer.actor, { gameweekId: s.gameweek.id, violationTypeId: violation!.id, playerId: s.a1.playerId });
      expect(await ratingOf(s.a1.playerId)).toBe(1000 + RATING.PLAYED + 2 * RATING.PER_FINE_POINT);
    }));
});
