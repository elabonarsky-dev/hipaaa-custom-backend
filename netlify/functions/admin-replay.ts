import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "../../src/db";
import { getReviewItemWithSubmission, updateReviewItem } from "../../src/modules/review";
import {
  processSubmission,
  jotformPayloadSchema,
  extractFields,
  computeIdempotencyKey,
  deleteIdempotencyKey,
} from "../../src/modules/webhooks";
import type { JotformPayload } from "../../src/modules/webhooks/schema";
import { writeAuditLog } from "../../src/modules/audit";
import { getEnv } from "../../src/config";
import { logger, jsonResponse, errorResponse, getDecodedEventBody } from "../../src/utils";
import type { FormType } from "@/prisma";

interface ReplayRequest {
  reviewItemId: string;
  action: "approve" | "reject";
  reviewedBy: string;
  reviewNote?: string;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const expectedKey = getEnv().ADMIN_API_KEY;
  const apiKey = event.headers["x-api-key"] ?? event.headers["X-Api-Key"];
  if (!expectedKey || apiKey !== expectedKey) {
    return errorResponse(401, "Unauthorized");
  }

  try {
    const rawBody = getDecodedEventBody(event);
    if (!rawBody) {
      return errorResponse(400, "Missing request body");
    }

    let request: ReplayRequest;
    try {
      request = JSON.parse(rawBody) as ReplayRequest;
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }

    if (!request.reviewItemId || !request.action || !request.reviewedBy) {
      return errorResponse(400, "Missing required fields: reviewItemId, action, reviewedBy");
    }

    const db = getDb();
    const reviewItem = await getReviewItemWithSubmission(db, request.reviewItemId);

    if (!reviewItem) {
      return errorResponse(404, "Review item not found");
    }

    if (reviewItem.status !== "PENDING") {
      return errorResponse(409, `Review item already ${reviewItem.status}`);
    }

    if (request.action === "reject") {
      await updateReviewItem(db, request.reviewItemId, "REJECTED", request.reviewedBy, request.reviewNote);
      await writeAuditLog(db, "REVIEW_REJECTED", "Review item rejected", {
        reviewItemId: request.reviewItemId,
        reviewedBy: request.reviewedBy,
      });

      return jsonResponse(200, { action: "rejected", reviewItemId: request.reviewItemId });
    }

    const rawPayload = reviewItem.submissionEvent.rawPayload as Record<string, unknown>;
    const formType = reviewItem.submissionEvent.formType as FormType;

    const parsed = jotformPayloadSchema.safeParse(rawPayload);
    const payload = parsed.success ? parsed.data : rawPayload;
    const fields = extractFields(payload as JotformPayload);
    const idempotencyKey = computeIdempotencyKey(fields.submissionId, rawPayload);
    await deleteIdempotencyKey(db, idempotencyKey);

    await writeAuditLog(db, "REPLAY_TRIGGERED", "Replaying submission from review queue", {
      reviewItemId: request.reviewItemId,
      submissionEventId: reviewItem.submissionEventId,
      reviewedBy: request.reviewedBy,
      idempotencyKey,
    });

    let result;
    try {
      result = await processSubmission(db, formType, rawPayload);
    } catch (replayErr) {
      await db.idempotencyKey
        .create({ data: { key: idempotencyKey } })
        .catch(() => undefined);
      throw replayErr;
    }

    await updateReviewItem(db, request.reviewItemId, "REPLAYED", request.reviewedBy, request.reviewNote);

    logger.info({ reviewItemId: request.reviewItemId, result: { action: result.action } }, "Replay completed");

    return jsonResponse(200, {
      action: "replayed",
      reviewItemId: request.reviewItemId,
      replayResult: result,
    });
  } catch (err) {
    logger.error({ err }, "Admin replay error");
    return errorResponse(500, "Internal server error");
  }
};
