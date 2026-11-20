/**
 * Input validation shared by forms (client) and server actions, so a rule is written
 * once. Field limits are generous; they exist to stop abuse, not to police names.
 */
import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email());
const displayName = z.string().trim().min(2).max(40);

export const registerSchema = z.object({
  displayName,
  email,
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
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
