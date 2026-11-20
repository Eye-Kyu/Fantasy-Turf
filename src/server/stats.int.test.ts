import { describe, expect, it } from "vitest";
import { confirmAttendance } from "./calendar";
import { goalInput, playTime, setupMatch as setup, uuid } from "./match-test-utils";
import { recordEvent } from "./scoring";
import { getPartnerships, getSeasonAwards } from "./stats";
import { withRollback } from "./test-utils";

describe("partnerships and awards", () => {
  it("counts assist→goal pairs and ignores voided ones", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      for (const p of [s.a1, s.a2, s.b1]) {
        await confirmAttendance(db, s.organizer.actor, { gameweekId: s.gameweek.id, playerId: p.playerId, attended: true });
      }
      for (let i = 0; i < 2; i++) {
        const g = uuid();
        await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId, g), playTime);
        await recordEvent(db, s.scorer.actor, { matchId: s.matchId, clientId: uuid(), type: "ASSIST", playerId: s.a2.playerId, relatedClientId: g, occurredAt: playTime }, playTime);
      }
      const lone = uuid();
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.b1.playerId, lone), playTime);

      const pairs = await getPartnerships(db, { seasonId: s.season.id });
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toMatchObject({ scorerId: s.a1.playerId, assisterId: s.a2.playerId, goals: 2 });
      expect(await getPartnerships(db, { seasonId: s.season.id, playerId: s.b1.playerId })).toHaveLength(0);

      const awards = await getSeasonAwards(db, s.season.id);
      expect(awards.final).toBe(false);
      expect(awards.goldenBoot).toMatchObject({ value: 2, names: ["A1"] });
      expect(awards.topAssister).toMatchObject({ value: 2, names: ["A2"] });
      expect(awards.bestPartnership?.goals).toBe(2);
      expect(awards.longestStreak?.value).toBe(1);
      expect(awards.playerOfTheMonth?.names).toContain("A1");
    }));

  it("has no awards before anything is played", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const awards = await getSeasonAwards(db, s.season.id);
      expect(awards.goldenBoot).toBeNull();
    }));
});
