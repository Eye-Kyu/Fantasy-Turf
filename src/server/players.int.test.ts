import { describe, expect, it } from "vitest";
import type { DbExecutor } from "@/db/client";
import { ForbiddenError, TraitExistsError } from "./errors";
import {
  createTrait,
  getPlayerProfile,
  listTraits,
  setPlayerTraits,
  updateOwnProfile,
} from "./players";
import { makeUser, withRollback } from "./test-utils";

describe("traits are super-admin only", () => {
  it("forbids managers and organizers from creating traits or assigning them", () =>
    withRollback(async (db) => {
      const admin = await makeUser(db, "Admin", "SUPER_ADMIN");
      await createTrait(db, admin.actor, { name: "Scorer", category: "Attack" });
      const [trait] = await listTraits(db);

      for (const role of ["MANAGER", "ORGANIZER"] as const) {
        const user = await makeUser(db, `User${role}`, role);
        await expect(
          createTrait(db, user.actor, { name: "Nope", category: "X" }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          setPlayerTraits(db, user.actor, user.playerId, [trait!.id]),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
    }));

  it("lets a super admin assign, replace and clear a player's traits", () =>
    withRollback(async (db) => {
      const admin = await makeUser(db, "Admin", "SUPER_ADMIN");
      const player = await makeUser(db, "Juma", "MANAGER");
      await createTrait(db, admin.actor, { name: "Scorer", category: "Attack" });
      await createTrait(db, admin.actor, { name: "Talisman", category: "Leader" });
      const [scorer, talisman] = await listTraits(db); // ordered by category: Attack, Leader

      await setPlayerTraits(db, admin.actor, player.playerId, [scorer!.id, scorer!.id]);
      expect((await getPlayerProfile(db, player.playerId))?.traits.map((t) => t.name)).toEqual(["Scorer"]);

      await setPlayerTraits(db, admin.actor, player.playerId, [talisman!.id, "00000000-0000-0000-0000-000000000000"]);
      expect((await getPlayerProfile(db, player.playerId))?.traits.map((t) => t.name)).toEqual(["Talisman"]);

      await setPlayerTraits(db, admin.actor, player.playerId, []);
      expect((await getPlayerProfile(db, player.playerId))?.traits).toEqual([]);
    }));

  it("rejects a duplicate trait name", () =>
    withRollback(async (db) => {
      const admin = await makeUser(db, "Admin", "SUPER_ADMIN");
      await createTrait(db, admin.actor, { name: "Scorer", category: "Attack" });
      await expect(
        createTrait(db, admin.actor, { name: "Scorer", category: "Attack" }),
      ).rejects.toBeInstanceOf(TraitExistsError);
    }));
});

describe("updateOwnProfile", () => {
  it("changes the actor's own profile and nobody else's", () =>
    withRollback(async (db) => {
      const amina = await makeUser(db, "Amina", "MANAGER");
      const juma = await makeUser(db, "Juma", "MANAGER");
      await updateOwnProfile(db, amina.actor, { displayName: "Amina K", bio: "Striker" });

      expect(await getPlayerProfile(db, amina.playerId)).toMatchObject({ displayName: "Amina K", bio: "Striker" });
      expect(await getPlayerProfile(db, juma.playerId)).toMatchObject({ displayName: "Juma", bio: null });
    }));
});
