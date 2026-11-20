/** Invite-only registration: creating, checking and consuming invite links. */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { invites } from "@/db/schema";
import { INVITE_TTL_DAYS } from "@/lib/auth/policy";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { type Actor, assertCan } from "./actor";
import { InvalidInviteError } from "./errors";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Creates a single-use invite. The token is returned once and never stored, so the
 * caller must show the link to the organizer right away.
 */
export async function createInvite(db: DbExecutor, actor: Actor, now = new Date()) {
  assertCan(actor, "inviteUsers");
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * MS_PER_DAY);
  await db.insert(invites).values({ tokenHash: hashToken(token), createdBy: actor.userId, expiresAt });
  return { token, expiresAt };
}

/** Whether a token is an unused, unexpired invite (to decide if the form is shown). */
export async function isInviteUsable(db: DbExecutor, token: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, now)));
  return Boolean(row);
}

/**
 * Marks an invite used and returns its id. The single UPDATE both checks and claims it,
 * so two people racing on one link cannot both get in.
 *
 * @throws InvalidInviteError if the invite is unknown, expired or already used.
 */
export async function claimInvite(db: DbExecutor, token: string, now = new Date()): Promise<string> {
  const [claimed] = await db
    .update(invites)
    .set({ usedAt: now })
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, now)))
    .returning({ id: invites.id });
  if (!claimed) throw new InvalidInviteError();
  return claimed.id;
}

/** Records who registered with an invite. */
export async function recordInviteUser(db: DbExecutor, inviteId: string, userId: string): Promise<void> {
  await db.update(invites).set({ usedBy: userId }).where(eq(invites.id, inviteId));
}
