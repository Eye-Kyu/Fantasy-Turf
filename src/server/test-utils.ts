/** Helpers for integration tests (*.int.test.ts) that run against the real database. */
import { type DbExecutor, getDb } from "@/db/client";

const ROLLBACK = new Error("rollback");

/**
 * Runs `work` inside a transaction that is always rolled back, so a test can write
 * real rows and leave the database exactly as it found it.
 */
export async function withRollback<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
  let result!: T;
  await getDb()
    .transaction(async (tx) => {
      result = await work(tx);
      throw ROLLBACK;
    })
    .catch((error) => {
      if (error !== ROLLBACK) throw error;
    });
  return result;
}
