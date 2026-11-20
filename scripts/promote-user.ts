/**
 * Changes a user's role from the command line (the only way to create the first super
 * admin, since registration always makes managers). Run on the server:
 *
 *   npm run admin:promote -- someone@example.com SUPER_ADMIN
 *
 * Role defaults to SUPER_ADMIN. Valid roles: MANAGER, ORGANIZER, SUPER_ADMIN.
 */
import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { USER_ROLES, type UserRole } from "../src/lib/auth/roles";

async function main(): Promise<void> {
  const [email, role = "SUPER_ADMIN"] = process.argv.slice(2);

  if (!email || !USER_ROLES.includes(role as UserRole)) {
    throw new Error(`Usage: npm run admin:promote -- <email> [${USER_ROLES.join("|")}]`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  }

  const db = createDb(process.env.DATABASE_URL);
  try {
    const updated = await db
      .update(users)
      .set({ role: role as UserRole })
      .where(eq(users.email, email.trim().toLowerCase()))
      .returning({ email: users.email, role: users.role });

    if (updated.length === 0) throw new Error(`No user with email ${email}. They must register first.`);
    console.log(`${updated[0]!.email} is now ${updated[0]!.role}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
