/** Account creation and password sign-in. Pure database logic; cookies live elsewhere. */
import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { players, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { UserRole } from "@/lib/auth/roles";
import { normalizePhone } from "@/lib/phone";
import { isUniqueViolation, violatedConstraint } from "./db-errors";
import { EmailTakenError, PhoneTakenError, TooManyAttemptsError } from "./errors";
import { claimInvite, recordInviteUser } from "./invites";
import { clearFailedLogins, isLoginLocked, recordFailedLogin } from "./login-throttle";

export interface NewAccount {
  email: string;
  /** Already normalized with normalizePhone. */
  phone: string;
  password: string;
  displayName: string;
  inviteToken: string;
}

/**
 * Creates a user and their player profile together (every user is also a player),
 * consuming an invite. If anything fails (including a taken email), the invite is not
 * used up. New accounts are always MANAGERs; promote with `npm run admin:promote`.
 *
 * @throws InvalidInviteError if the invite is unknown, expired or already used.
 * @throws EmailTakenError / PhoneTakenError if either is already registered.
 */
export async function registerAccount(db: DbExecutor, input: NewAccount, now = new Date()) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const inviteId = await claimInvite(tx, input.inviteToken, now);
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, phone: input.phone, passwordHash })
        .returning({ id: users.id, role: users.role });
      await recordInviteUser(tx, inviteId, user!.id);
      const [player] = await tx
        .insert(players)
        .values({ userId: user!.id, displayName: input.displayName })
        .returning({ id: players.id });
      return { userId: user!.id, role: user!.role, playerId: player!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw violatedConstraint(error)?.includes("phone") ? new PhoneTakenError() : new EmailTakenError();
    }
    throw error;
  }
}

// Verified against when the account is unknown, so a missing account takes as long to
// reject as a wrong password and cannot be told apart by timing.
const unknownUserHash = hashPassword("no-such-account-placeholder");

/** What was typed into the login box: an email if it has an @, otherwise a phone number. */
function parseIdentifier(input: string) {
  const text = input.trim().toLowerCase();
  if (text.includes("@")) return { key: text, column: users.email };
  const phone = normalizePhone(text);
  return { key: phone ?? text, column: users.phone };
}

/**
 * Returns the user for a correct email-or-phone + password, otherwise null.
 *
 * @throws TooManyAttemptsError while the identifier is locked after repeated failures
 *   (checked before the password, so guessing during the lock learns nothing).
 */
export async function authenticate(
  db: DbExecutor,
  identifier: string,
  password: string,
  now = new Date(),
): Promise<{ userId: string; role: UserRole } | null> {
  const { key, column } = parseIdentifier(identifier);
  if (await isLoginLocked(db, key, now)) throw new TooManyAttemptsError();

  const [user] = await db
    .select({ id: users.id, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(column, key));

  const valid = await verifyPassword(password, user?.passwordHash ?? (await unknownUserHash));
  if (!user || !valid) {
    await recordFailedLogin(db, key, now);
    return null;
  }
  await clearFailedLogins(db, key);
  return { userId: user.id, role: user.role };
}
