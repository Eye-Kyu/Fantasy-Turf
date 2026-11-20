import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  // Columns are written in camelCase in code and stored as snake_case.
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
