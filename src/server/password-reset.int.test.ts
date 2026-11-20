import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { sessions, users } from "@/db/schema";
import { authenticate } from "./accounts";
import { completePasswordReset, createPasswordReset, isResetUsable } from "./password-reset";
import { createSession } from "./sessions";
import { makeUser, withRollback } from "./test-utils";

describe("password reset", () => {
  it("lets an organizer reset a manager once, ending their sessions", () =>
    withRollback(async (db) => {
      const organizer = await makeUser(db, "Org", "ORGANIZER");
      const manager = await makeUser(db, "Mgr", "MANAGER");
      await createSession(db, manager.actor.userId);

      const { token } = await createPasswordReset(db, organizer.actor, manager.actor.userId);
      expect(await isResetUsable(db, token)).toBe(true);
      await completePasswordReset(db, token, "a-brand-new-password");

      expect(await db.select().from(sessions).where(eq(sessions.userId, manager.actor.userId))).toHaveLength(0);
      expect(await isResetUsable(db, token)).toBe(false);
      await expect(completePasswordReset(db, token, "another-password-1")).rejects.toMatchObject({ name: "InvalidResetError" });
      expect(await authenticate(db, (await db.select().from(users).where(eq(users.id, manager.actor.userId)))[0]!.email, "a-brand-new-password")).not.toBeNull();
    }));

  it("only the newest link works, and links expire", () =>
    withRollback(async (db) => {
      const organizer = await makeUser(db, "Org", "ORGANIZER");
      const manager = await makeUser(db, "Mgr", "MANAGER");
      const now = new Date();
      const first = await createPasswordReset(db, organizer.actor, manager.actor.userId, now);
      const second = await createPasswordReset(db, organizer.actor, manager.actor.userId, now);
      expect(await isResetUsable(db, first.token, now)).toBe(false);
      expect(await isResetUsable(db, second.token, now)).toBe(true);
      expect(await isResetUsable(db, second.token, new Date(now.getTime() + 25 * 3600 * 1000))).toBe(false);
    }));

  it("keeps organizers and admins out of other privileged accounts", () =>
    withRollback(async (db) => {
      const organizer = await makeUser(db, "Org", "ORGANIZER");
      const other = await makeUser(db, "Org2", "ORGANIZER");
      const admin = await makeUser(db, "Admin", "SUPER_ADMIN");
      const manager = await makeUser(db, "Mgr", "MANAGER");
      await expect(createPasswordReset(db, organizer.actor, other.actor.userId)).rejects.toMatchObject({ name: "ForbiddenError" });
      await expect(createPasswordReset(db, manager.actor, organizer.actor.userId)).rejects.toMatchObject({ name: "ForbiddenError" });
      await createPasswordReset(db, admin.actor, other.actor.userId);
    }));
});
