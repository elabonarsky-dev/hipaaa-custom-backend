import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "../../src/db";
import { listReviewQueue } from "../../src/modules/review";
import { getEnv } from "../../src/config";
import { jsonResponse, errorResponse } from "../../src/utils";
import type { ReviewStatus } from "@prisma/client";

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const apiKey = event.headers["x-api-key"] ?? event.headers["X-Api-Key"];
  if (apiKey !== getEnv().ADMIN_API_KEY) {
    return errorResponse(401, "Unauthorized");
  }

  try {
    const params = event.queryStringParameters ?? {};
    const status = params.status as ReviewStatus | undefined;
    const limit = Math.min(parseInt(params.limit ?? "50", 10), 200);
    const offset = parseInt(params.offset ?? "0", 10);

    const db = getDb();
    const items = await listReviewQueue(db, status, limit, offset);

    return jsonResponse(200, {
      count: items.length,
      limit,
      offset,
      items,
    });
  } catch (err) {
    return errorResponse(500, "Internal server error");
  }
};
