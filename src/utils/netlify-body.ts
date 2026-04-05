import type { HandlerEvent } from "@netlify/functions";

/**
 * Netlify / Lambda may pass the request body base64-encoded when `isBase64Encoded` is true.
 */
export function getDecodedEventBody(event: HandlerEvent): string | null {
  if (event.body == null || event.body === "") {
    return null;
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf8");
  }
  return event.body;
}

/**
 * Parse JotForm webhook POST body: JSON object or `application/x-www-form-urlencoded` flat fields.
 */
export function parseJotFormPostBody(event: HandlerEvent): Record<string, unknown> | null {
  const raw = getDecodedEventBody(event);
  if (raw == null) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    try {
      const params = new URLSearchParams(raw);
      const obj: Record<string, string> = {};
      for (const [key, value] of params.entries()) {
        obj[key] = value;
      }
      return obj;
    } catch {
      return null;
    }
  }
}
