/**
 * Random one-time secrets (session cookies, invite links). The holder keeps the token;
 * the database keeps only its SHA-256 hash, so a database leak does not expose them.
 */
import { createHash, randomBytes } from "node:crypto";

/** A new unguessable token (256 bits), safe to put in a cookie or a URL. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The value stored in the database for a token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
