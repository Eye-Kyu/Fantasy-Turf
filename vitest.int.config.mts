import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests run against the real Postgres in DATABASE_URL. Read it from .env
// unless the environment already provides it (e.g. in CI); a missing .env is fine then.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file: the tests will fail with a clear "DATABASE_URL is not set" error.
  }
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.int.test.ts"],
    // Tests share one database, so run them one file at a time.
    fileParallelism: false,
  },
});
