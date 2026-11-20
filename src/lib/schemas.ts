/**
 * Input validation shared by forms (client) and server actions, so a rule is written
 * once. Field limits are generous; they exist to stop abuse, not to police names.
 */
import { z } from "zod";
import { normalizePhone } from "./phone";
import { EVENT_TYPES } from "./domain";
import { parseNairobiDateTime } from "./time";

const email = z.string().trim().toLowerCase().pipe(z.email());
const displayName = z.string().trim().min(2).max(40);
// Stored in +E.164 form so every way of writing a number matches the same account.
const phone = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) ctx.addIssue({ code: "custom", message: "Enter a valid phone number" });
    return normalized ?? z.NEVER;
  });

export const registerSchema = z.object({
  displayName,
  email,
  phone,
  password: z.string().min(8, "Use at least 8 characters").max(200),
  inviteToken: z.string().min(1).max(200),
});

export const loginSchema = z.object({
  // An email or a phone number; parsed by the sign-in service.
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1),
});

export const profileSchema = z.object({
  displayName,
  // An empty bio is stored as null.
  bio: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (value === "" ? null : value)),
});

export const traitSchema = z.object({
  name: z.string().trim().min(2).max(30),
  category: z.string().trim().min(2).max(30),
});

export const seasonSchema = z.object({
  name: z.string().trim().min(2).max(40),
  startsOn: z.iso.date(),
});

export const gameweekSchema = z.object({
  seasonId: z.uuid(),
  // A datetime-local form value, read as Nairobi time.
  kickoffAt: z.string().transform((value, ctx) => {
    const date = parseNairobiDateTime(value);
    if (!date) ctx.addIssue({ code: "custom", message: "Enter a valid kick-off time" });
    return date ?? z.NEVER;
  }),
});

export const rsvpSchema = z.object({
  gameweekId: z.uuid(),
  // Omitted when players answer for themselves; set by an organizer answering for someone.
  playerId: z.uuid().optional(),
  status: z.enum(["GOING", "NOT_GOING"]),
});

export const attendanceSchema = z.object({
  gameweekId: z.uuid(),
  playerId: z.uuid(),
  attended: z.enum(["true", "false"]).transform((value) => value === "true"),
});

// Team-sorting forms. `gameweekId` is only where to return to after the action.
export const addMatchSchema = z.object({ gameweekId: z.uuid() });
export const deleteMatchSchema = z.object({ gameweekId: z.uuid(), matchId: z.uuid() });
export const assignPlayerSchema = z.object({ gameweekId: z.uuid(), teamId: z.uuid(), playerId: z.uuid() });
export const unassignPlayerSchema = z.object({ gameweekId: z.uuid(), matchId: z.uuid(), playerId: z.uuid() });

/** A phone's queued scoring operations. Team ids from the phone are display-only; the server uses its own. */
export const scoringOpsSchema = z.object({
  ops: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("add"),
          clientId: z.uuid(),
          type: z.enum(EVENT_TYPES),
          teamId: z.uuid(),
          playerId: z.uuid(),
          relatedClientId: z.uuid().nullable(),
          occurredAt: z.iso.datetime(),
        }),
        z.object({ kind: z.literal("void"), clientId: z.uuid() }),
      ]),
    )
    .max(200),
});

export const matchActionSchema = z.object({ matchId: z.uuid() });
export const gameweekActionSchema = z.object({ gameweekId: z.uuid(), matchId: z.uuid().optional() });
export const eventActionSchema = z.object({ matchId: z.uuid(), clientId: z.uuid() });
export const changeEventPlayerSchema = eventActionSchema.extend({ playerId: z.uuid() });
