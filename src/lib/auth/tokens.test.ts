import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";

describe("tokens", () => {
  it("generates a different unguessable token each time", () => {
    const a = generateToken();
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(a).not.toBe(generateToken());
  });

  it("stores a stable hash that is not the token itself", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });
});
