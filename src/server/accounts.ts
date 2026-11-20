/** Account creation and password sign-in. Pure database logic; cookies live elsewhere. */
import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { players, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { UserRole } from "@/lib/auth/roles";
import { isUniqueViolation } from "./db-errors";
import { EmailTakenError } from "./errors";

export interface NewAccount {
  email: string;
  password: string;
  displayName: string;
}

/**
 * Creates a user and their player profile together (every user is also a player).
 * New accounts are always MANAGERs; promote with `npm run admin:promote`.
 *
 * @throws EmailTakenError if the email is already registered.
 */
export async function registerAccount(db: DbExecutor, input: NewAccount) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash })
        .returning({ id: users.id, role: users.role });
      const [player] = await tx
        .insert(players)
        .values({ userId: user!.id, displayName: input.displayName })
        .returning({ id: players.id });
      return { userId: user!.id, role: user!.role, playerId: player!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError();
    throw error;
  }
}

// Verified against when the email is unknown, so a missing account takes as long to
// reject as a wrong password and cannot be told apart by timing.
const unknownUserHash = hashPassword("no-such-account-placeholder");

/** Returns the user for a correct email + password, otherwise null. */
export async function authenticate(
  db: DbExecutor,
  email: string,
  password: string,
): Promise<{ userId: string; role: UserRole } | null> {
  const [user] = await db
    .select({ id: users.id, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));

  const valid = await verifyPassword(password, user?.passwordHash ?? (await unknownUserHash));
  return user && valid ? { userId: user.id, role: user.role } : null;
}
