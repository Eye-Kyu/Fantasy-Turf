/** Helpers for integration tests (*.int.test.ts) that run against the real database. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { type DbExecutor, getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";
import { registerAccount } from "./accounts";
import type { Actor } from "./actor";
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

let userCounter = 0;

/** Registers a user with the given role; returns them as an actor plus their player id. */
export async function makeUser(db: DbExecutor, name: string, role: UserRole) {
  const n = ++userCounter;
  const account = await registerAccount(db, {
    email: `${name.toLowerCase()}${n}@example.com`,
    phone: `+2547${String(500000 + n).padStart(8, "0")}`,
    password: "a-long-password",
    displayName: name,
    inviteToken: await makeInviteToken(db),
  });
  await db.update(users).set({ role }).where(eq(users.id, account.userId));
  return { actor: { userId: account.userId, role } as Actor, playerId: account.playerId };
}
