import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_DAYS,
  isSessionExpired,
  sessionExpiry,
} from "./session";

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
