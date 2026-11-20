import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_DAYS,
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  sessionExpiry,
} from "./session";

describe("session tokens", () => {
  it("generates a different unguessable token each time", () => {
    const a = generateSessionToken();
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(a).not.toBe(generateSessionToken());
  });

  it("stores a stable hash that is not the token itself", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(generateSessionToken()));
  });
});

describe("session expiry", () => {
  const now = new Date("2026-11-20T12:00:00Z");

  it("expires SESSION_TTL_DAYS after creation", () => {
    const days = (sessionExpiry(now).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(SESSION_TTL_DAYS);
  });

  it("is valid just before the expiry and expired at it", () => {
    const expiresAt = sessionExpiry(now);
    expect(isSessionExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isSessionExpired(expiresAt, expiresAt)).toBe(true);
  });
});
