import { describe, it, expect } from "vitest";
import { hashPayload } from "./hash";

describe("hashPayload", () => {
  it("produces consistent hash for same payload", () => {
    const payload = { a: 1, b: "test" };
    const hash1 = hashPayload(payload);
    const hash2 = hashPayload(payload);
    expect(hash1).toBe(hash2);
  });

  it("produces same hash regardless of key order", () => {
    const hash1 = hashPayload({ a: 1, b: 2 });
    const hash2 = hashPayload({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it("produces different hash for different payloads", () => {
    const hash1 = hashPayload({ a: 1 });
    const hash2 = hashPayload({ a: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = hashPayload({ x: "y" });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
