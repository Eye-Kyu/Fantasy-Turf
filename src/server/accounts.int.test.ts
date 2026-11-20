import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { sessions } from "@/db/schema";
import { SESSION_TTL_DAYS } from "@/lib/auth/session";
import type { DbExecutor } from "@/db/client";
import { type NewAccount, authenticate, registerAccount } from "./accounts";
import { LOGIN_LOCK_WINDOW_MINUTES, MAX_FAILED_LOGINS } from "@/lib/auth/policy";
import {
  EmailTakenError,
  ForbiddenError,
  InvalidInviteError,
  PhoneTakenError,
  TooManyAttemptsError,
} from "./errors";
import { createInvite, isInviteUsable } from "./invites";
import { createSession, deleteSession, findSessionUser } from "./sessions";
import { makeInviteToken, withRollback } from "./test-utils";

const account = {
  email: "amina@example.com",
  phone: "+254712345678",
  password: "a-long-password",
  displayName: "Amina",
};
const register = async (db: DbExecutor, overrides: Partial<NewAccount> = {}) =>
  registerAccount(db, { ...account, inviteToken: await makeInviteToken(db), ...overrides });

describe("registerAccount", () => {
  it("creates a manager with a linked player profile", () =>
    withRollback(async (db) => {
      const result = await register(db);
      expect(result.role).toBe("MANAGER");
      const token = (await createSession(db, result.userId)).token;
      const user = await findSessionUser(db, token);
      expect(user).toMatchObject({ email: account.email, playerId: result.playerId });
    }));

  it("rejects a second account with the same email or the same phone", () =>
    withRollback(async (db) => {
      await register(db);
      await expect(register(db, { phone: "+254700000001" })).rejects.toBeInstanceOf(EmailTakenError);
      await expect(register(db, { email: "other@example.com" })).rejects.toBeInstanceOf(PhoneTakenError);
    }));
});

describe("invite-only registration", () => {
  it("rejects an unknown, used or expired invite", () =>
    withRollback(async (db) => {
      await expect(register(db, { inviteToken: "not-a-real-invite" })).rejects.toBeInstanceOf(InvalidInviteError);

      const used = await makeInviteToken(db);
      await register(db, { inviteToken: used });
      await expect(
        register(db, { inviteToken: used, email: "b@example.com", phone: "+254700000002" }),
      ).rejects.toBeInstanceOf(InvalidInviteError);

      const longAgo = new Date("2026-01-01T00:00:00Z");
      const expired = await makeInviteToken(db, longAgo);
      await expect(
        register(db, { inviteToken: expired, email: "c@example.com", phone: "+254700000003" }),
      ).rejects.toBeInstanceOf(InvalidInviteError);
    }));

  it("only lets organizers and super admins create invites", () =>
    withRollback(async (db) => {
      const manager = await register(db);
      await expect(createInvite(db, { userId: manager.userId, role: "MANAGER" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createInvite(db, { userId: manager.userId, role: "ORGANIZER" })).resolves.toHaveProperty("token");
    }));

  it("does not use up the invite when registration fails", () =>
    withRollback(async (db) => {
      await register(db);
      const token = await makeInviteToken(db);
      // The email is taken, so this registration fails and must leave the invite intact.
      await expect(register(db, { inviteToken: token, phone: "+254700000004" })).rejects.toBeInstanceOf(EmailTakenError);
      expect(await isInviteUsable(db, token)).toBe(true);
    }));
});

describe("authenticate", () => {
  it("accepts the right password and rejects wrong passwords and unknown emails", () =>
    withRollback(async (db) => {
      const { userId } = await register(db);
      expect(await authenticate(db, account.email, account.password)).toEqual({
        userId,
        role: "MANAGER",
      });
      expect(await authenticate(db, account.email, "wrong-password")).toBeNull();
      expect(await authenticate(db, "nobody@example.com", account.password)).toBeNull();
    }));

  it("signs in with a phone number written any common way", () =>
    withRollback(async (db) => {
      const { userId } = await register(db);
      for (const written of ["+254712345678", "0712 345 678", "712345678"]) {
        expect((await authenticate(db, written, account.password))?.userId).toBe(userId);
      }
      expect(await authenticate(db, "0712 345 678", "wrong-password")).toBeNull();
    }));

  it("locks an identifier after repeated failures, even for the right password, then unlocks", () =>
    withRollback(async (db) => {
      await register(db);
      const now = new Date("2026-06-01T12:00:00Z");
      for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
        expect(await authenticate(db, account.email, "wrong-password", now)).toBeNull();
      }
      await expect(authenticate(db, account.email, account.password, now)).rejects.toBeInstanceOf(TooManyAttemptsError);

      const later = new Date(now.getTime() + (LOGIN_LOCK_WINDOW_MINUTES + 1) * 60_000);
      expect(await authenticate(db, account.email, account.password, later)).not.toBeNull();
    }));

  it("a successful sign-in resets the failure count", () =>
    withRollback(async (db) => {
      await register(db);
      for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) await authenticate(db, account.email, "wrong-password");
      expect(await authenticate(db, account.email, account.password)).not.toBeNull();
      for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) await authenticate(db, account.email, "wrong-password");
      expect(await authenticate(db, account.email, account.password)).not.toBeNull();
    }));
});

describe("sessions", () => {
  it("finds the user for a valid token and not for an unknown one", () =>
    withRollback(async (db) => {
      const { userId } = await register(db);
      const { token } = await createSession(db, userId);
      expect((await findSessionUser(db, token))?.userId).toBe(userId);
      expect(await findSessionUser(db, "not-a-real-token")).toBeNull();
    }));

  it("stores only a hash of the token", () =>
    withRollback(async (db) => {
      const { userId } = await register(db);
      const { token } = await createSession(db, userId);
      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokenHash).not.toBe(token);
    }));

  it("rejects and removes an expired session", () =>
    withRollback(async (db) => {
      const { userId } = await register(db);
      const created = new Date("2026-01-01T00:00:00Z");
      const { token } = await createSession(db, userId, created);
      const afterExpiry = new Date(created.getTime() + (SESSION_TTL_DAYS + 1) * 86_400_000);
      expect(await findSessionUser(db, token, afterExpiry)).toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    }));

  it("ends the session on logout", () =>
    withRollback(async (db) => {
      const { userId } = await register(db);
      const { token } = await createSession(db, userId);
      await deleteSession(db, token);
      expect(await findSessionUser(db, token)).toBeNull();
    }));
});
