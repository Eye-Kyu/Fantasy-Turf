import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { players } from "@/db/schema";
import { confirmAttendance } from "./calendar";
import { createSquad, getLineupForDisplay, getOpenGameweek, getSquad, setLineup, transferPlayer } from "./fantasy";
import { getFantasyLeaderboard, getSquadScores } from "./fantasy-points";
import { FantasyError } from "./errors";
import { early, goalInput, playTime, setupMatch as setup } from "./match-test-utils";
import { lockGameweek, reconcileMatch, recordEvent } from "./scoring";
import { makeUser, withRollback } from "./test-utils";

type S = Awaited<ReturnType<typeof setup>>;
const six = (s: S) => [s.a1, s.a2, s.b1, s.b2, s.scorer, s.organizer].map((p) => p.playerId);

async function setPrice(db: Parameters<typeof setup>[0], playerId: string, price: string) {
  await db.update(players).set({ price }).where(eq(players.id, playerId));
}

describe("fantasy squads", () => {
  it("creates a squad within budget and a default lineup", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const manager = await makeUser(db, "Manager", "MANAGER");
      await createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: six(s) }, early);
      const squad = (await getSquad(db, manager.actor.userId, s.season.id))!;
      expect(squad.players).toHaveLength(6);
      expect(squad.bank).toBeCloseTo(2, 5); // 50 - 6*8
      const lineup = await getLineupForDisplay(db, squad, s.gameweek.id);
      expect(lineup.filter((e) => e.slot === "STARTER")).toHaveLength(4);
      expect(lineup.filter((e) => e.isCaptain)).toHaveLength(1);
    }));

  it("rejects over-budget, duplicate and second squads", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const manager = await makeUser(db, "Manager", "MANAGER");
      const ids = six(s);
      await setPrice(db, ids[0]!, "15.0");
      await setPrice(db, ids[1]!, "15.0");
      await expect(createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: ids }, early)).rejects.toMatchObject({ code: "over-budget" });
      await expect(createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: [ids[0]!, ids[0]!, ...ids.slice(2)] }, early)).rejects.toMatchObject({ code: "squad-invalid" });
      await setPrice(db, ids[0]!, "8.0");
      await setPrice(db, ids[1]!, "8.0");
      await createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: ids }, early);
      await expect(createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: ids }, early)).rejects.toMatchObject({ code: "squad-exists" });
    }));

  it("saves a lineup until the lock, then refuses", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const manager = await makeUser(db, "Manager", "MANAGER");
      const ids = six(s);
      await createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: ids }, early);
      const input = { gameweekId: s.gameweek.id, starterIds: ids.slice(0, 4), benchIds: [ids[5]!, ids[4]!], captainId: ids[1]! };
      await setLineup(db, manager.actor, input, early);
      const squad = (await getSquad(db, manager.actor.userId, s.season.id))!;
      const lineup = await getLineupForDisplay(db, squad, s.gameweek.id);
      expect(lineup.find((e) => e.isCaptain)?.playerId).toBe(ids[1]);
      expect(lineup.find((e) => e.benchOrder === 1)?.playerId).toBe(ids[5]);
      await expect(setLineup(db, manager.actor, { ...input, captainId: ids[4]! }, early)).rejects.toMatchObject({ code: "squad-invalid" });
      await expect(setLineup(db, manager.actor, input, playTime)).rejects.toMatchObject({ code: "lineup-locked" });
    }));

  it("allows one transfer per gameweek and keeps the lineup slot", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const manager = await makeUser(db, "Manager", "MANAGER");
      const outsider = await makeUser(db, "Outsider", "MANAGER");
      const ids = six(s);
      await createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: ids }, early);
      await setPrice(db, outsider.playerId, "10.0");
      await transferPlayer(db, manager.actor, { seasonId: s.season.id, playerOutId: ids[0]!, playerInId: outsider.playerId }, early);
      const squad = (await getSquad(db, manager.actor.userId, s.season.id))!;
      expect(squad.bank).toBeCloseTo(0, 5); // 2 + 8 - 10
      const lineup = await getLineupForDisplay(db, squad, s.gameweek.id);
      expect(lineup.find((e) => e.playerId === outsider.playerId)).toBeDefined();
      expect(lineup.find((e) => e.playerId === ids[0])).toBeUndefined();
      await expect(
        transferPlayer(db, manager.actor, { seasonId: s.season.id, playerOutId: ids[1]!, playerInId: ids[0]! }, early),
      ).rejects.toMatchObject({ code: "transfer-used" });
    }));

  it("refuses transfers that overspend", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const manager = await makeUser(db, "Manager", "MANAGER");
      const outsider = await makeUser(db, "Outsider", "MANAGER");
      await createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: six(s) }, early);
      await setPrice(db, outsider.playerId, "15.0");
      await expect(
        transferPlayer(db, manager.actor, { seasonId: s.season.id, playerOutId: s.a1.playerId, playerInId: outsider.playerId }, early),
      ).rejects.toBeInstanceOf(FantasyError);
    }));

  it("scores locked gameweeks into the leaderboard with a captain bonus", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      const manager = await makeUser(db, "Manager", "MANAGER");
      const ids = six(s);
      await createSquad(db, manager.actor, { seasonId: s.season.id, playerIds: ids }, early);
      await setLineup(db, manager.actor, { gameweekId: s.gameweek.id, starterIds: [s.a1.playerId, s.a2.playerId, s.b1.playerId, s.b2.playerId], benchIds: [s.scorer.playerId, s.organizer.playerId], captainId: s.a1.playerId }, early);
      for (const p of [s.a1, s.a2, s.b1, s.b2]) {
        await confirmAttendance(db, s.organizer.actor, { gameweekId: s.gameweek.id, playerId: p.playerId, attended: true });
      }
      await recordEvent(db, s.scorer.actor, goalInput(s.matchId, s.a1.playerId), playTime);

      expect((await getFantasyLeaderboard(db, s.season.id))[0]?.total).toBe(0); // not locked yet

      await reconcileMatch(db, s.organizer.actor, s.matchId, playTime);
      await lockGameweek(db, s.organizer.actor, s.gameweek.id, playTime);

      const [row] = await getFantasyLeaderboard(db, s.season.id);
      const [score] = await getSquadScores(db, (await getSquad(db, manager.actor.userId, s.season.id))!.id);
      expect(row?.total).toBe(score?.total);
      expect(score?.final).toBe(true);
      expect(score?.players.find((p) => p.captain)?.playerId).toBe(s.a1.playerId);
      expect(row?.total).toBeGreaterThan(0);
    }));

  it("finds the open gameweek by the lock", () =>
    withRollback(async (db) => {
      const s = await setup(db);
      expect((await getOpenGameweek(db, s.season.id, early))?.id).toBe(s.gameweek.id);
      expect(await getOpenGameweek(db, s.season.id, playTime)).toBeNull();
    }));
});
