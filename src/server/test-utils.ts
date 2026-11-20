/** Helpers for integration tests (*.int.test.ts) that run against the real database. */
import { randomUUID } from "node:crypto";
import { type DbExecutor, getDb } from "@/db/client";
import { users } from "@/db/schema";
import { createInvite } from "./invites";

const ROLLBACK = new Error("rollback");

/**
 * Runs `work` inside a transaction that is always rolled back, so a test can write
 * real rows and leave the database exactly as it found it.
 */
export async function withRollback<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
  let result!: T;
  await getDb()
    .transaction(async (tx) => {
      result = await work(tx);
      throw ROLLBACK;
    })
    .catch((error) => {
      if (error !== ROLLBACK) throw error;
    });
  return result;
}

/** A fresh unused invite token, created by a throwaway super admin. */
export async function makeInviteToken(db: DbExecutor, now = new Date()): Promise<string> {
  const [inviter] = await db
    .insert(users)
    .values({ email: `inviter-${randomUUID()}@example.com`, passwordHash: "unused", role: "SUPER_ADMIN" })
    .returning({ id: users.id });
  const { token } = await createInvite(db, { userId: inviter!.id, role: "SUPER_ADMIN" }, now);
  return token;
}
