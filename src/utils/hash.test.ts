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

  it("produces same hash for nested objects regardless of inner key order", () => {
    const hash1 = hashPayload({ outer: { b: 2, a: 1 } } as Record<string, unknown>);
    const hash2 = hashPayload({ outer: { a: 1, b: 2 } } as Record<string, unknown>);
    expect(hash1).toBe(hash2);
  });

  it("handles bigint values without throwing", () => {
    const h = hashPayload({ id: 1n } as unknown as Record<string, unknown>);
    expect(h).toHaveLength(64);
  });

  it("serializes Date deterministically", () => {
    const d = new Date("2020-01-15T12:00:00.000Z");
    const h1 = hashPayload({ t: d } as unknown as Record<string, unknown>);
    const h2 = hashPayload({ t: d } as unknown as Record<string, unknown>);
    expect(h1).toBe(h2);
  });
});
