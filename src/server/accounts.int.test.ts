import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { sessions } from "@/db/schema";
import { SESSION_TTL_DAYS } from "@/lib/auth/session";
import { authenticate, registerAccount } from "./accounts";
import { EmailTakenError } from "./errors";
import { createSession, deleteSession, findSessionUser } from "./sessions";
import { withRollback } from "./test-utils";

const account = { email: "amina@example.com", password: "a-long-password", displayName: "Amina" };

describe("registerAccount", () => {
  it("creates a manager with a linked player profile", () =>
    withRollback(async (db) => {
      const result = await registerAccount(db, account);
      expect(result.role).toBe("MANAGER");
      const token = (await createSession(db, result.userId)).token;
      const user = await findSessionUser(db, token);
      expect(user).toMatchObject({ email: account.email, playerId: result.playerId });
    }));

  it("rejects a second account with the same email", () =>
    withRollback(async (db) => {
      await registerAccount(db, account);
      await expect(registerAccount(db, account)).rejects.toBeInstanceOf(EmailTakenError);
    }));
});

describe("authenticate", () => {
  it("accepts the right password and rejects wrong passwords and unknown emails", () =>
    withRollback(async (db) => {
      const { userId } = await registerAccount(db, account);
      expect(await authenticate(db, account.email, account.password)).toEqual({
        userId,
        role: "MANAGER",
      });
      expect(await authenticate(db, account.email, "wrong-password")).toBeNull();
      expect(await authenticate(db, "nobody@example.com", account.password)).toBeNull();
    }));
});

describe("sessions", () => {
  it("finds the user for a valid token and not for an unknown one", () =>
    withRollback(async (db) => {
      const { userId } = await registerAccount(db, account);
      const { token } = await createSession(db, userId);
      expect((await findSessionUser(db, token))?.userId).toBe(userId);
      expect(await findSessionUser(db, "not-a-real-token")).toBeNull();
    }));

  it("stores only a hash of the token", () =>
    withRollback(async (db) => {
      const { userId } = await registerAccount(db, account);
      const { token } = await createSession(db, userId);
      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokenHash).not.toBe(token);
    }));

  it("rejects and removes an expired session", () =>
    withRollback(async (db) => {
      const { userId } = await registerAccount(db, account);
      const created = new Date("2026-01-01T00:00:00Z");
      const { token } = await createSession(db, userId, created);
      const afterExpiry = new Date(created.getTime() + (SESSION_TTL_DAYS + 1) * 86_400_000);
      expect(await findSessionUser(db, token, afterExpiry)).toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    }));

  it("ends the session on logout", () =>
    withRollback(async (db) => {
      const { userId } = await registerAccount(db, account);
      const { token } = await createSession(db, userId);
      await deleteSession(db, token);
      expect(await findSessionUser(db, token)).toBeNull();
    }));
});
