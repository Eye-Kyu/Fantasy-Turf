import { describe, expect, it } from "vitest";
import { newClientId } from "./client-id";

describe("newClientId", () => {
  it("is a valid v4 UUID and different each time", () => {
    const id = newClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientId()).not.toBe(id);
  });
});
