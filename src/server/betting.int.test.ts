import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bets } from "@/db/schema";
import { confirmAttendance } from "./calendar";
import { getBalance, placeBet, settleGameweekBets } from "./betting";
import { goalInput, playTime, setupMatch as setup } from "./match-test-utils";
import { lockGameweek, reconcileMatch, recordEvent } from "./scoring";
import { makeUser, withRollback } from "./test-utils";

const betting = new Date("2026-11-28T11:00:00Z"); // after the lock (10:00Z), before kick-off (13:00Z)

describe("betting", () => {
  it("pools stakes, pays winners and refunds one-sided pools when the gameweek locks", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const x = await makeUser(db, "X", "MANAGER");
      const y = await makeUser(db, "Y", "MANAGER");
      const seasonId = s.season.id;
      await placeBet(db, x.actor, { matchId: s.matchId, type: "MATCH_WINNER", pickId: s.teamA, stake: 20 }, betting);
      await placeBet(db, y.actor, { matchId: s.matchId, type: "MATCH_WINNER", pickId: s.teamB, stake: 30 }, betting);
      await placeBet(db, x.actor, { matchId: s.matchId, type: "TOP_SCORER", pickId: s.a1.playerId, stake: 10 }, betting);
      expect(await getBalance(db, x.actor.userId, seasonId)).toBe(100 - 30);

      for (const p of [s.a1, s.a2, s.b1]) {
        await confirmAttendance(db, s.organizer.actor, { gameweekId: s.gameweek.id, playerId: p.playerId, attended: true });
      }
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);

      const rows = await db.select().from(bets);
      const of = (userId: string, type: string) => rows.find((b) => b.userId === userId && b.type === type)!;
      expect(of(x.actor.userId, "MATCH_WINNER")).toMatchObject({ status: "WON", payout: 50 });
      expect(of(y.actor.userId, "MATCH_WINNER")).toMatchObject({ status: "LOST", payout: 0 });
      expect(of(x.actor.userId, "TOP_SCORER")).toMatchObject({ status: "VOID", payout: 10 }); // only bettor
      expect(await settleGameweekBets(db, s.gameweek.id)).toBe(0); // idempotent
    }));

  it("refunds a draw", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const x = await makeUser(db, "X", "MANAGER");
      const y = await makeUser(db, "Y", "MANAGER");
      await placeBet(db, x.actor, { matchId: s.matchId, type: "MATCH_WINNER", pickId: s.teamA, stake: 20 }, betting);
      await placeBet(db, y.actor, { matchId: s.matchId, type: "MATCH_WINNER", pickId: s.teamB, stake: 30 }, betting);
      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);
      const rows = await db.select().from(bets);
      expect(rows.every((b) => b.status === "VOID" && b.payout === b.stake)).toBe(true);
    }));

  it("enforces the rules", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const x = await makeUser(db, "X", "MANAGER");
      const bet = (actor = x.actor, over: object = {}, when = betting) =>
        placeBet(db, actor, { matchId: s.matchId, type: "MATCH_WINNER", pickId: s.teamA, stake: 10, ...over }, when);

      await expect(bet(x.actor, {}, new Date("2026-11-28T09:00:00Z"))).rejects.toMatchObject({ code: "closed" }); // teams not locked
      await expect(bet(x.actor, {}, new Date("2026-11-28T13:30:00Z"))).rejects.toMatchObject({ code: "closed" }); // after kick-off
      await expect(bet(s.a1.actor)).rejects.toMatchObject({ code: "own-match" });
      await expect(bet(s.scorer.actor)).rejects.toMatchObject({ code: "own-match" });
      await expect(bet(x.actor, { stake: 0 })).rejects.toMatchObject({ code: "stake" });
      await expect(bet(x.actor, { stake: 51 })).rejects.toMatchObject({ code: "stake" });
      await expect(bet(x.actor, { pickId: s.a1.playerId })).rejects.toMatchObject({ code: "invalid-pick" });
      await expect(bet(x.actor, { type: "TOP_SCORER", pickId: s.teamA })).rejects.toMatchObject({ code: "invalid-pick" });
      await bet();
      await expect(bet()).rejects.toMatchObject({ code: "duplicate" });
      // 100 start - 10 = 90 left: three more 30s fit, the fourth does not
      await placeBet(db, x.actor, { matchId: s.matchId, type: "TOP_SCORER", pickId: s.a1.playerId, stake: 50 }, betting);
      await placeBet(db, x.actor, { matchId: s.matchId, type: "TOP_ASSISTS", pickId: s.a2.playerId, stake: 40 }, betting);
      expect(await getBalance(db, x.actor.userId, s.season.id)).toBe(0);
      await expect(db.select().from(bets).where(eq(bets.userId, x.actor.userId))).resolves.toHaveLength(3);
    }));
});
