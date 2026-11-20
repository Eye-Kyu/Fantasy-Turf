/**
 * Input validation shared by forms (client) and server actions, so a rule is written
 * once. Field limits are generous; they exist to stop abuse, not to police names.
 */
import { z } from "zod";
import { normalizePhone } from "./phone";

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
