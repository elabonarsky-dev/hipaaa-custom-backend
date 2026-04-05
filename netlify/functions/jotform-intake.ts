import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "../../src/db";
import { processSubmission } from "../../src/modules/webhooks";
import {
  logger,
  jsonResponse,
  errorResponse,
  verifyJotFormWebhook,
  parseJotFormPostBody,
} from "../../src/utils";

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const auth = verifyJotFormWebhook(event);
  if (!auth.ok) {
    return errorResponse(auth.statusCode, auth.message);
  }

  try {
    const body = parseJotFormPostBody(event);
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
