import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "../../src/db";
import { processSubmission } from "../../src/modules/webhooks";
import { logger, jsonResponse, errorResponse } from "../../src/utils";

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  try {
    const body = parseBody(event);
    if (!body) {
      return errorResponse(400, "Missing or invalid request body");
    }

    const db = getDb();
    const result = await processSubmission(db, "INTAKE", body);

    logger.info({ result: { action: result.action } }, "Intake processed");

    return jsonResponse(result.success ? 200 : 422, result);
  } catch (err) {
    logger.error({ err }, "Intake handler error");
    return errorResponse(500, "Internal server error");
  }
};

function parseBody(event: HandlerEvent): Record<string, unknown> | null {
  if (!event.body) return null;

  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    try {
      const params = new URLSearchParams(event.body);
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
