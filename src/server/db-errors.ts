/** Postgres error code for a unique constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * True if a thrown error is a unique-constraint violation. Drizzle wraps the driver
 * error, so the Postgres code can be on the error itself or on its `cause`.
 */
export function isUniqueViolation(error: unknown): boolean {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return code === UNIQUE_VIOLATION || cause?.code === UNIQUE_VIOLATION;
}
