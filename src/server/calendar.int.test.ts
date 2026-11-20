import { describe, expect, it } from "vitest";
import type { DbExecutor } from "@/db/client";
import {
  confirmAttendance,
  createGameweek,
  createSeason,
  getNextGameweek,
  getOwnRsvp,
  listAttendance,
  listGameweeks,
  setRsvp,
} from "./calendar";
import { ForbiddenError, RsvpClosedError, SeasonExistsError } from "./errors";
import { makeUser, withRollback } from "./test-utils";

const kickoff = new Date("2026-11-28T13:00:00Z"); // lock at 10:00Z

async function setup(db: DbExecutor) {
  const organizer = await makeUser(db, "Organizer", "ORGANIZER");
  const season = await createSeason(db, organizer.actor, { name: "Season 1", startsOn: "2026-11-01" });
  const gameweek = await createGameweek(db, organizer.actor, { seasonId: season.id, kickoffAt: kickoff });
  return { organizer, season, gameweek };
}

describe("seasons and gameweeks", () => {
  it("numbers gameweeks in order", () =>
    withRollback(async (db) => {
      const { organizer, season } = await setup(db);
      await createGameweek(db, organizer.actor, { seasonId: season.id, kickoffAt: new Date("2026-12-05T13:00:00Z") });
      const weeks = await listGameweeks(db, season.id);
      expect(weeks.map((w) => w.number)).toEqual([1, 2]);
    }));

  it("is for organizers only and rejects a duplicate season name", () =>
    withRollback(async (db) => {
      const { organizer } = await setup(db);
      const manager = await makeUser(db, "Manager", "MANAGER");
      await expect(createSeason(db, manager.actor, { name: "X1", startsOn: "2026-11-01" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        createSeason(db, organizer.actor, { name: "Season 1", startsOn: "2026-11-01" }),
      ).rejects.toBeInstanceOf(SeasonExistsError);
    }));

  it("finds the next gameweek that has not kicked off", () =>
    withRollback(async (db) => {
      const { gameweek } = await setup(db);
      expect((await getNextGameweek(db, new Date("2026-11-27T00:00:00Z")))?.id).toBe(gameweek.id);
      expect(await getNextGameweek(db, new Date("2026-11-29T00:00:00Z"))).toBeNull();
    }));
});

describe("RSVP and attendance", () => {
  it("lets a player RSVP and change their mind until the lock, then closes", () =>
    withRollback(async (db) => {
      const { gameweek } = await setup(db);
      const amina = await makeUser(db, "Amina", "MANAGER");
      const before = new Date("2026-11-28T09:59:00Z");
      const input = { gameweekId: gameweek.id, playerId: amina.playerId };

      expect(await getOwnRsvp(db, amina.actor.userId, gameweek.id)).toBe("NO_RESPONSE");
      await setRsvp(db, amina.actor, { ...input, status: "GOING" }, before);
      await setRsvp(db, amina.actor, { ...input, status: "NOT_GOING" }, before);
      expect(await getOwnRsvp(db, amina.actor.userId, gameweek.id)).toBe("NOT_GOING");

      await expect(
        setRsvp(db, amina.actor, { ...input, status: "GOING" }, new Date("2026-11-28T10:00:00Z")),
      ).rejects.toBeInstanceOf(RsvpClosedError);
    }));

  it("stops players changing anyone else's RSVP, but lets an organizer, even after the lock", () =>
    withRollback(async (db) => {
      const { organizer, gameweek } = await setup(db);
      const amina = await makeUser(db, "Amina", "MANAGER");
      const juma = await makeUser(db, "Juma", "MANAGER");
      const forAmina = { gameweekId: gameweek.id, playerId: amina.playerId, status: "GOING" as const };

      await expect(setRsvp(db, juma.actor, forAmina)).rejects.toBeInstanceOf(ForbiddenError);
      await setRsvp(db, organizer.actor, forAmina, new Date("2026-11-28T12:00:00Z"));
      expect(await getOwnRsvp(db, amina.actor.userId, gameweek.id)).toBe("GOING");
    }));

  it("lets only organizers confirm attendance, and lists every player", () =>
    withRollback(async (db) => {
      const { organizer, gameweek } = await setup(db);
      const amina = await makeUser(db, "Amina", "MANAGER");
      const input = { gameweekId: gameweek.id, playerId: amina.playerId, attended: true };

      await expect(confirmAttendance(db, amina.actor, input)).rejects.toBeInstanceOf(ForbiddenError);
      await setRsvp(db, amina.actor, { gameweekId: gameweek.id, playerId: amina.playerId, status: "GOING" }, new Date("2026-11-20T00:00:00Z"));
      await confirmAttendance(db, organizer.actor, input);

      const list = await listAttendance(db, gameweek.id);
      expect(list.find((p) => p.playerId === amina.playerId)).toMatchObject({ rsvp: "GOING", attended: true });
      expect(list.find((p) => p.playerId === organizer.playerId)).toMatchObject({ rsvp: "NO_RESPONSE", attended: false });
    }));
});
