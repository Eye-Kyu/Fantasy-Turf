import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mirror the "@/*" path alias from tsconfig so tests import like app code.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Unit tests only; tests that need a database are *.int.test.ts (npm run test:db).
  test: { include: ["src/**/*.test.ts"], exclude: ["**/*.int.test.ts", "node_modules/**"] },
});
