import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "../../src/db";
import { listReviewQueue } from "../../src/modules/review";
import { getEnv } from "../../src/config";
import { jsonResponse, errorResponse } from "../../src/utils";
import type { ReviewStatus } from "@/prisma";

const REVIEW_STATUSES = new Set<string>([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "REPLAYED",
]);

function parseListLimit(raw: string | undefined, max: number): number {
  const n = parseInt(raw ?? "50", 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, max);
}

function parseListOffset(raw: string | undefined): number {
  const n = parseInt(raw ?? "0", 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const expectedKey = getEnv().ADMIN_API_KEY;
  const apiKey = event.headers["x-api-key"] ?? event.headers["X-Api-Key"];
  if (!expectedKey || apiKey !== expectedKey) {
    return errorResponse(401, "Unauthorized");
  }

  try {
    const params = event.queryStringParameters ?? {};
    const statusRaw = params.status;
    if (statusRaw !== undefined && statusRaw !== "" && !REVIEW_STATUSES.has(statusRaw)) {
      return errorResponse(400, "Invalid status; use PENDING, APPROVED, REJECTED, or REPLAYED");
    }
    const status = statusRaw ? (statusRaw as ReviewStatus) : undefined;
    const limit = parseListLimit(params.limit, 200);
    const offset = parseListOffset(params.offset);

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
