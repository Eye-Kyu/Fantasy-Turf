/**
 * Runs a command against the hosted Neon database instead of the local one in .env:
 * reads .env.neon (written by `neon deploy`, never committed) and sets DATABASE_URL to the
 * direct, non-pooled address, which migrations and admin scripts need.
 *
 *   npm run neon:migrate
 *   npm run neon:admin:create -- "Name" email phone
 *   npm run neon:start          (the built app on the pooled address, as Vercel runs it)
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

let vars;
try {
  vars = parseEnv(readFileSync(".env.neon", "utf8"));
} catch {
  throw new Error(".env.neon is missing: run `npx neon@latest env pull`, then move the Neon lines out of .env into .env.neon");
}
let [command, ...args] = process.argv.slice(2);
const pooled = command === "--pooled";
if (pooled) [command, ...args] = args;
const url = pooled ? vars.DATABASE_URL : vars.DATABASE_URL_UNPOOLED;
if (!url || url.includes("-pooler") !== pooled) throw new Error(`.env.neon has no ${pooled ? "pooled DATABASE_URL" : "direct DATABASE_URL_UNPOOLED"}`);

console.log(`Using the Neon database at ${new URL(url).hostname}`);
const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, DATABASE_URL: url } });
child.on("exit", (code) => process.exit(code ?? 1));
