/**
 * Shared shape of the form actions that change game-day data: validate the form, run the
 * change as the signed-in user, and return to a page with a notice or an error code.
 * The services enforce who may do what; this only translates their errors into the
 * short codes the pages turn into messages (see messages.ts).
 */
import { redirect } from "next/navigation";
import type { ZodType } from "zod";
import type { Actor } from "@/server/actor";
import { requireUser, toActor } from "@/server/current-user";
import {
  BettingError, FantasyError, ForbiddenError, InvalidFineError, NotFoundError, PlayerNotGoingError, ScoringError, TeamsLockedError,
  ViolationExistsError,
} from "@/server/errors";
import { revalidatePath } from "next/cache";

/** The URL error code for an error a service throws on purpose, or null for anything else. */
function errorCode(error: unknown): string | null {
  if (error instanceof ForbiddenError) return "forbidden";
  if (error instanceof ScoringError) return `score-${error.code}`;
  if (error instanceof TeamsLockedError) return "teams-locked";
  if (error instanceof PlayerNotGoingError) return "not-going";
  if (error instanceof InvalidFineError) return "fine-invalid";
  if (error instanceof ViolationExistsError) return "violation-exists";
  if (error instanceof BettingError) return `bet-${error.code}`;
  if (error instanceof FantasyError) return `fantasy-${error.code}`;
  if (error instanceof NotFoundError) return "invalid";
  return null;
}

/** Form data as a plain object; a key that appears more than once (checkboxes) becomes an array. */
function formToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return result;
}

export async function runFormAction<T>(
  formData: FormData,
  options: {
    schema: ZodType<T>;
    /** The page to come back to, given the validated input. */
    page: (input: T) => string;
    /** Notice code shown after success. */
    notice: string;
    /** Where to send the person if the form itself is malformed. Defaults to the games list. */
    invalidPage?: string;
    change: (actor: Actor, input: T) => Promise<unknown>;
  },
): Promise<void> {
  const user = await requireUser();
  const parsed = options.schema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`${options.invalidPage ?? "/gameweeks"}?error=invalid`);
  const page = options.page(parsed.data);

  try {
    await options.change(toActor(user), parsed.data);
  } catch (error) {
    const code = errorCode(error);
    if (code) redirect(`${page}?error=${code}`);
    throw error;
  }
  revalidatePath(page);
  redirect(`${page}?saved=${options.notice}`);
}
