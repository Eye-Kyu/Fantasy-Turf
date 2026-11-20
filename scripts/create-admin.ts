/**
 * Creates the first super admin from the command line. Registration is invite-only, so
 * on an empty database nobody exists yet to send an invite. Run on the server:
 *
 *   npm run admin:create -- "Your Name" you@example.com 0712345678
 *
 * The password is asked for interactively so it never lands in shell history.
 */
import { createInterface } from "node:readline";
import { createDb } from "../src/db/client";
import { registerSchema } from "../src/lib/schemas";
import { players, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

/** Reads one line from the terminal without echoing it. */
function askPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput;
  (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = (text) => {
    // Show the prompt itself, hide what is typed.
    if (text.includes(prompt)) write.call(rl, text);
  };
  return new Promise((resolve) =>
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

async function main(): Promise<void> {
  const [displayName, email, phone] = process.argv.slice(2);
  if (!displayName || !email || !phone) {
    throw new Error('Usage: npm run admin:create -- "Your Name" you@example.com 0712345678');
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

  const password = await askPassword("Password (min 8 characters): ");
  // Reuse the registration rules so this account is valid in exactly the same way.
  const parsed = registerSchema.safeParse({ displayName, email, phone, password, inviteToken: "n/a" });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));

  const db = createDb(process.env.DATABASE_URL);
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: parsed.data.email,
          phone: parsed.data.phone,
          passwordHash: await hashPassword(parsed.data.password),
          role: "SUPER_ADMIN",
        })
        .returning({ id: users.id });
      await tx.insert(players).values({ userId: user!.id, displayName: parsed.data.displayName });
    });
    console.log(`Super admin created: ${parsed.data.email}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
