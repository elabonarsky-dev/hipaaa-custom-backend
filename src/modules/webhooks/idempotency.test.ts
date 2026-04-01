import { describe, it, expect } from "vitest";
import { computeIdempotencyKey } from "./idempotency";

describe("computeIdempotencyKey", () => {
  it("uses jotform submission ID when available", () => {
    const key = computeIdempotencyKey("12345", { foo: "bar" });
    expect(key).toBe("jotform:12345");
  });

  it("falls back to payload hash when no submission ID", () => {
    const key = computeIdempotencyKey(null, { foo: "bar" });
    expect(key).toMatch(/^hash:[0-9a-f]{64}$/);
  });

  it("produces consistent keys for same payload", () => {
    const key1 = computeIdempotencyKey(null, { a: 1, b: 2 });
    const key2 = computeIdempotencyKey(null, { a: 1, b: 2 });
    expect(key1).toBe(key2);
  });
});
