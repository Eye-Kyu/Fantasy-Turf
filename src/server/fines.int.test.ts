import { describe, expect, it } from "vitest";
import { ForbiddenError, InvalidFineError, NotFoundError, ViolationExistsError } from "./errors";
import {
  createViolation, issueFine, listGameweekFines, listPlayerFines, listViolations, seedDefaultViolations,
  updateViolation, voidFine,
} from "./fines";
import { setupMatch as setup } from "./match-test-utils";
import { getGameweekPoints } from "./points";
import { DEFAULT_VIOLATIONS } from "@/lib/violations";
import { withRollback } from "./test-utils";

describe("violation catalog", () => {
  it("seeds the defaults once and leaves existing entries alone", () =>
    withRollback(async (db) => {
      const { organizer } = await setup(db);
      const before = (await listViolations(db)).length;
      const added = await seedDefaultViolations(db, organizer.actor);
      expect(added).toBeGreaterThan(0);
      expect(await seedDefaultViolations(db, organizer.actor)).toBe(0);
      expect((await listViolations(db)).length).toBe(before + added);
      expect((await listViolations(db)).find((v) => v.name === "Entering the D")?.defaultPoints).toBe(1);
      expect(added).toBeLessThanOrEqual(DEFAULT_VIOLATIONS.length);
    }));

  it("lets organizers add, re-price and retire violations, and managers none of it", () =>
    withRollback(async (db) => {
      const { organizer, a1 } = await setup(db);
      await expect(createViolation(db, a1.actor, { name: "Nope", defaultPoints: 1 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(seedDefaultViolations(db, a1.actor)).rejects.toBeInstanceOf(ForbiddenError);

      await createViolation(db, organizer.actor, { name: "Test violation", defaultPoints: 2 });
      await expect(createViolation(db, organizer.actor, { name: "Test violation", defaultPoints: 1 })).rejects.toBeInstanceOf(ViolationExistsError);
      const [created] = (await listViolations(db)).filter((v) => v.name === "Test violation");
      await updateViolation(db, organizer.actor, { violationTypeId: created!.id, defaultPoints: 3, isActive: false });
      expect((await listViolations(db, { activeOnly: true })).some((v) => v.id === created!.id)).toBe(false);
      expect((await listViolations(db)).find((v) => v.id === created!.id)?.defaultPoints).toBe(3);
    }));
});

describe("issuing and voiding fines", () => {
  async function withViolation(db: Parameters<typeof setup>[0]) {
    const s = await setup(db);
    await createViolation(db, s.organizer.actor, { name: "Fine test", defaultPoints: 2 });
    const [violation] = (await listViolations(db)).filter((v) => v.name === "Fine test");
    return { ...s, violation: violation! };
  }

  it("copies the catalog points, allows an override, and keeps old fines when the catalog changes", () =>
    withRollback(async (db) => {
      const s = await withViolation(db);
      const base = { gameweekId: s.gameweek.id, violationTypeId: s.violation.id };
      await issueFine(db, s.organizer.actor, { ...base, playerId: s.a1.playerId });
      await issueFine(db, s.organizer.actor, { ...base, playerId: s.b1.playerId, points: 5, note: "Second warning", matchId: s.matchId });
      await updateViolation(db, s.organizer.actor, { violationTypeId: s.violation.id, defaultPoints: 1, isActive: true });

      const list = await listGameweekFines(db, s.gameweek.id);
      expect(list.map((f) => f.points).sort()).toEqual([2, 5]);
      expect(list.find((f) => f.playerId === s.b1.playerId)).toMatchObject({ note: "Second warning", issuedBy: "Organizer", violation: "Fine test" });
      expect(await listPlayerFines(db, s.a1.playerId)).toHaveLength(1);
    }));

  it("deducts from gameweek points, and voiding gives them back", () =>
    withRollback(async (db) => {
      const s = await withViolation(db);
      await issueFine(db, s.organizer.actor, { gameweekId: s.gameweek.id, violationTypeId: s.violation.id, playerId: s.a1.playerId });
      const total = async () => (await getGameweekPoints(db, s.gameweek.id)).rows.find((r) => r.playerId === s.a1.playerId)?.total;
      expect(await total()).toBe(-2);

      const [fine] = await listGameweekFines(db, s.gameweek.id);
      await voidFine(db, s.organizer.actor, fine!.id);
      await voidFine(db, s.organizer.actor, fine!.id); // harmless twice
      expect(await total()).toBeUndefined(); // no active fine, nothing played: no row at all
      expect((await listGameweekFines(db, s.gameweek.id))[0]!.voidedAt).not.toBeNull(); // history kept
    }));

  it("is for organizers only", () =>
    withRollback(async (db) => {
      const s = await withViolation(db);
      const input = { gameweekId: s.gameweek.id, violationTypeId: s.violation.id, playerId: s.b1.playerId };
      await expect(issueFine(db, s.a1.actor, input)).rejects.toBeInstanceOf(ForbiddenError);
      await issueFine(db, s.organizer.actor, input);
      const [fine] = await listGameweekFines(db, s.gameweek.id);
      await expect(voidFine(db, s.a1.actor, fine!.id)).rejects.toBeInstanceOf(ForbiddenError);
    }));

  it("refuses a retired violation, a match from another gameweek, and unknown ids", () =>
    withRollback(async (db) => {
      const s = await withViolation(db);
      const other = await setup(db); // a different gameweek and match
      const base = { gameweekId: s.gameweek.id, violationTypeId: s.violation.id, playerId: s.a1.playerId };

      await expect(issueFine(db, s.organizer.actor, { ...base, matchId: other.matchId })).rejects.toBeInstanceOf(InvalidFineError);
      await expect(issueFine(db, s.organizer.actor, { ...base, playerId: crypto.randomUUID() })).rejects.toBeInstanceOf(NotFoundError);
      await updateViolation(db, s.organizer.actor, { violationTypeId: s.violation.id, defaultPoints: 2, isActive: false });
      await expect(issueFine(db, s.organizer.actor, base)).rejects.toBeInstanceOf(InvalidFineError);
      await expect(voidFine(db, s.organizer.actor, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    }));
});
