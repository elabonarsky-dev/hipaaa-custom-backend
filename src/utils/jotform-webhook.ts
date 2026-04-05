import type { HandlerEvent } from "@netlify/functions";
import { getEnv } from "../config";

/**
 * Optional shared secret. Configure JotForm (or a proxy) to send the same value in a header or query param.
 * Netlify normalizes header names to lowercase.
 */
export function verifyJotFormWebhook(event: HandlerEvent): {
  ok: true;
} | { ok: false; statusCode: number; message: string } {
  const secret = getEnv().JOTFORM_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: true };
  }

  const headers = event.headers ?? {};
  const provided =
    headers["x-jotform-webhook-secret"] ??
    headers["x-webhook-secret"] ??
    event.queryStringParameters?.webhook_secret;

  if (!provided || provided !== secret) {
    return { ok: false, statusCode: 401, message: "Invalid webhook secret" };
  }

  return { ok: true };
}
