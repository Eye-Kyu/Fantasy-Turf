import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/** Creates the Drizzle client for a connection string (injectable for tests). */
export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Anything queries can run on: the client itself or an open transaction. */
export type DbExecutor = Db | DbTransaction;

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
