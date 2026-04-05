import { createHash } from "crypto";

/**
 * Deterministic JSON-like string for hashing: sorted keys at every object level.
 * Improves idempotency when nested key order differs between webhook retries.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
