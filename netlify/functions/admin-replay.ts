import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "../../src/db";
import { getReviewItemWithSubmission, updateReviewItem } from "../../src/modules/review";
import { processSubmission } from "../../src/modules/webhooks";
import { writeAuditLog } from "../../src/modules/audit";
import { getEnv } from "../../src/config";
import { logger, jsonResponse, errorResponse } from "../../src/utils";
import type { FormType } from "@prisma/client";

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

  const apiKey = event.headers["x-api-key"] ?? event.headers["X-Api-Key"];
  if (apiKey !== getEnv().ADMIN_API_KEY) {
    return errorResponse(401, "Unauthorized");
  }

  try {
    if (!event.body) {
      return errorResponse(400, "Missing request body");
    }

    const request = JSON.parse(event.body) as ReplayRequest;

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

    await updateReviewItem(db, request.reviewItemId, "REPLAYED", request.reviewedBy, request.reviewNote);

    const rawPayload = reviewItem.submissionEvent.rawPayload as Record<string, unknown>;
    const formType = reviewItem.submissionEvent.formType as FormType;

    await writeAuditLog(db, "REPLAY_TRIGGERED", "Replaying submission from review queue", {
      reviewItemId: request.reviewItemId,
      submissionEventId: reviewItem.submissionEventId,
      reviewedBy: request.reviewedBy,
    });

    const result = await processSubmission(db, formType, rawPayload);

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
