/** The signed-in user for the current request, via the session cookie. */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { createSession, deleteSession, findSessionUser } from "./sessions";
import type { Actor } from "./actor";

const COOKIE_NAME = "session";

/**
 * Cookies are `Secure` in production. Set SESSION_COOKIE_SECURE=false only when the
 * production build is served over plain http (e.g. on a home network without TLS).
 */
const secure = process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false";

/** Signs a user in: creates a session and sets its cookie. */
export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(getDb(), userId);
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

/** Signs the current user out on this device. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) await deleteSession(getDb(), token);
  jar.delete(COOKIE_NAME);
}

/** The signed-in user, or null. Looked up once per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? findSessionUser(getDb(), token) : null;
});

/** The signed-in user; sends visitors who are not signed in to the login page. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** The user as an actor for service calls. */
export function toActor(user: { userId: string; role: Actor["role"] }): Actor {
  return { userId: user.userId, role: user.role };
}
