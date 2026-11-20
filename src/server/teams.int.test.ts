import { describe, expect, it } from "vitest";
import type { DbExecutor } from "@/db/client";
import { createGameweek, createSeason, setRsvp } from "./calendar";
import { ForbiddenError, PlayerNotGoingError, TeamsLockedError } from "./errors";
import { assignPlayer, createMatch, deleteMatch, getGameweekTeams, unassignPlayer } from "./teams";
import { makeUser, withRollback } from "./test-utils";

const kickoff = new Date("2026-11-28T13:00:00Z"); // lock at 10:00Z
const beforeLock = new Date("2026-11-28T09:00:00Z");

/** An organizer, a gameweek, and `count` players who are going. */
async function setup(db: DbExecutor, count = 2) {
  const organizer = await makeUser(db, "Organizer", "ORGANIZER");
  const season = await createSeason(db, organizer.actor, { name: `S${crypto.randomUUID().slice(0, 8)}`, startsOn: "2026-11-01" });
  const gameweek = await createGameweek(db, organizer.actor, { seasonId: season.id, kickoffAt: kickoff });
  const going = [];
  for (let i = 0; i < count; i++) {
    const player = await makeUser(db, `Player${i}`, "MANAGER");
    await setRsvp(db, player.actor, { gameweekId: gameweek.id, playerId: player.playerId, status: "GOING" }, beforeLock);
    going.push(player);
  }
  const match = await createMatch(db, organizer.actor, gameweek.id, beforeLock);
  const [first] = await getGameweekTeams(db, gameweek.id);
  return { organizer, gameweek, going, match, teamA: first!.teams[0]!, teamB: first!.teams[1]! };
}

describe("sorting players into teams", () => {
  it("creates numbered matches with two teams each", () =>
    withRollback(async (db) => {
      const { organizer, gameweek } = await setup(db, 0);
      await createMatch(db, organizer.actor, gameweek.id, beforeLock);
      const matches = await getGameweekTeams(db, gameweek.id);
      expect(matches.map((m) => m.number)).toEqual([1, 2]);
      expect(matches[0]!.teams.map((t) => t.name)).toEqual(["Team A", "Team B"]);
    }));

  it("assigns a going player, moves them to the other team, and unassigns them", () =>
    withRollback(async (db) => {
      const { organizer, gameweek, going, match, teamA, teamB } = await setup(db);
      const [amina, juma] = going as [(typeof going)[number], (typeof going)[number]];
      const names = async () => {
        const [m] = await getGameweekTeams(db, gameweek.id);
        return { a: m!.teams[0]!.players.map((p) => p.playerId), b: m!.teams[1]!.players.map((p) => p.playerId), free: m!.unassigned.map((p) => p.playerId) };
      };

      expect((await names()).free.sort()).toEqual([amina.playerId, juma.playerId].sort());
      await assignPlayer(db, organizer.actor, { teamId: teamA.id, playerId: amina.playerId }, beforeLock);
      await assignPlayer(db, organizer.actor, { teamId: teamB.id, playerId: juma.playerId }, beforeLock);
      expect(await names()).toMatchObject({ a: [amina.playerId], b: [juma.playerId], free: [] });

      // Assigning again to the other team moves them: still only one team per match.
      await assignPlayer(db, organizer.actor, { teamId: teamB.id, playerId: amina.playerId }, beforeLock);
      expect(await names()).toMatchObject({ a: [], free: [] });

      await unassignPlayer(db, organizer.actor, { matchId: match.id, playerId: amina.playerId }, beforeLock);
      expect((await names()).free).toEqual([amina.playerId]);
    }));

  it("only accepts players who RSVP'd Going", () =>
    withRollback(async (db) => {
      const { organizer, teamA } = await setup(db, 0);
      const maybe = await makeUser(db, "Maybe", "MANAGER");
      await expect(
        assignPlayer(db, organizer.actor, { teamId: teamA.id, playerId: maybe.playerId }, beforeLock),
      ).rejects.toBeInstanceOf(PlayerNotGoingError);
    }));

  it("takes a player off the teams when they change to Not going", () =>
    withRollback(async (db) => {
      const { organizer, gameweek, going, teamA } = await setup(db, 1);
      const player = going[0]!;
      await assignPlayer(db, organizer.actor, { teamId: teamA.id, playerId: player.playerId }, beforeLock);
      await setRsvp(db, player.actor, { gameweekId: gameweek.id, playerId: player.playerId, status: "NOT_GOING" }, beforeLock);
      const [match] = await getGameweekTeams(db, gameweek.id);
      expect(match!.teams.flatMap((t) => t.players)).toEqual([]);
      expect(match!.unassigned).toEqual([]);
    }));

  it("is for organizers only", () =>
    withRollback(async (db) => {
      const { going, gameweek, teamA, match } = await setup(db, 1);
      const player = going[0]!;
      await expect(createMatch(db, player.actor, gameweek.id, beforeLock)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        assignPlayer(db, player.actor, { teamId: teamA.id, playerId: player.playerId }, beforeLock),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteMatch(db, player.actor, match.id, beforeLock)).rejects.toBeInstanceOf(ForbiddenError);
    }));

  it("refuses every change from the lock onwards", () =>
    withRollback(async (db) => {
      const { organizer, gameweek, going, teamA, match } = await setup(db, 1);
      const player = going[0]!;
      await assignPlayer(db, organizer.actor, { teamId: teamA.id, playerId: player.playerId }, beforeLock);

      const atLock = new Date("2026-11-28T10:00:00Z");
      await expect(createMatch(db, organizer.actor, gameweek.id, atLock)).rejects.toBeInstanceOf(TeamsLockedError);
      await expect(
        unassignPlayer(db, organizer.actor, { matchId: match.id, playerId: player.playerId }, atLock),
      ).rejects.toBeInstanceOf(TeamsLockedError);
      await expect(
        assignPlayer(db, organizer.actor, { teamId: teamA.id, playerId: player.playerId }, atLock),
      ).rejects.toBeInstanceOf(TeamsLockedError);
      await expect(deleteMatch(db, organizer.actor, match.id, atLock)).rejects.toBeInstanceOf(TeamsLockedError);
    }));
});
