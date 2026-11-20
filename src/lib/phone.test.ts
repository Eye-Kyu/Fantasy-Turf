import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("turns every common Kenyan way of writing a number into one form", () => {
    for (const written of ["0712 345 678", "712345678", "254712345678", "+254 712-345-678", "(0712) 345678"]) {
      expect(normalizePhone(written)).toBe("+254712345678");
    }
    expect(normalizePhone("0112345678")).toBe("+254112345678");
  });

  it("accepts other countries only with a leading +", () => {
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
    expect(normalizePhone("447911123456")).toBeNull();
  });

  it("rejects things that are not phone numbers", () => {
    for (const bad of ["", "abc", "amina@example.com", "071234", "0212345678", "+0123456789", "+12"]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});
