/** Postgres error code for a unique constraint violation. */
const UNIQUE_VIOLATION = "23505";

type PgError = { code?: string; constraint?: string };

/** Drizzle wraps the driver error, so the Postgres details can be on `cause`. */
function pgError(error: unknown): PgError {
  const { cause, ...own } = error as PgError & { cause?: PgError };
  return own.code ? own : (cause ?? {});
}

/** True if a thrown error is a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return pgError(error).code === UNIQUE_VIOLATION;
}

/** The name of the violated unique constraint (e.g. "users_phone_unique"), if known. */
export function violatedConstraint(error: unknown): string | undefined {
  return pgError(error).constraint;
}
