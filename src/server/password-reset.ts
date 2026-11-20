/**
 * Organizer-issued password resets. No email or SMS is needed: an organizer creates a
 * one-time link for the person and sends it (e.g. on WhatsApp), like an invite.
 * Organizers may reset managers; only a super admin may reset organizers or other admins.
 */
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { loginFailures, passwordResets, players, sessions, users } from "@/db/schema";
import { RESET_TTL_HOURS } from "@/lib/auth/policy";
import { hashPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { type Actor, assertCan } from "./actor";
import { ForbiddenError, InvalidResetError, NotFoundError } from "./errors";

const MS_PER_HOUR = 60 * 60 * 1000;

/** Creates a reset link for a user. The token is returned once and never stored. */
export async function createPasswordReset(db: DbExecutor, actor: Actor, targetUserId: string, now = new Date()) {
  assertCan(actor, "resetPasswords");
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, targetUserId));
  if (!target) throw new NotFoundError("User");
  if (target.role !== "MANAGER" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("reset this account's password");

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + RESET_TTL_HOURS * MS_PER_HOUR);
  await db.transaction(async (tx) => {
    // Only the newest link works.
    await tx.delete(passwordResets).where(and(eq(passwordResets.userId, target.id), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({ tokenHash: hashToken(token), userId: target.id, createdBy: actor.userId, expiresAt });
  });
  return { token, expiresAt };
}

export async function isResetUsable(db: DbExecutor, token: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: passwordResets.id })
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)));
  return Boolean(row);
}

/**
 * Sets a new password with a reset link. The single UPDATE claims the link, so it
 * works once. All the person's sessions end and their sign-in lockout is cleared.
 * @throws InvalidResetError if the link is unknown, expired or already used.
 */
export async function completePasswordReset(db: DbExecutor, token: string, newPassword: string, now = new Date()): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
      .returning({ userId: passwordResets.userId });
    if (!claimed) throw new InvalidResetError();

    const [user] = await tx.update(users).set({ passwordHash }).where(eq(users.id, claimed.userId)).returning({ email: users.email, phone: users.phone });
    await tx.delete(sessions).where(eq(sessions.userId, claimed.userId));
    const identifiers = [user!.email, ...(user!.phone ? [user!.phone] : [])];
    await tx.delete(loginFailures).where(inArray(loginFailures.identifier, identifiers));
  });
}

/** People an organizer may reset, with their role, for the admin page. */
export async function listResettableUsers(db: DbExecutor, actor: Actor) {
  assertCan(actor, "resetPasswords");
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, name: players.displayName })
    .from(users)
    .leftJoin(players, eq(players.userId, users.id))
    .orderBy(players.displayName);
  return actor.role === "SUPER_ADMIN" ? rows : rows.filter((r) => r.role === "MANAGER");
}
