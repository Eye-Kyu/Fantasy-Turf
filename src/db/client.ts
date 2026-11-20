import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/** Creates the Drizzle client for a connection string (injectable for tests). */
export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;

let shared: Db | undefined;

/** The app-wide client, created on first use from DATABASE_URL. */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
    shared = createDb(url);
  }
  return shared;
}
