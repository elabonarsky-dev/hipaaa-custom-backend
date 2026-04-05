import type { PrismaClient, ReviewQueueItem, ReviewStatus } from "@/prisma";
import { createChildLogger } from "../../utils";

const log = createChildLogger({ module: "review" });

export async function addToReviewQueue(
  db: PrismaClient,
  submissionEventId: string,
  reason: string
): Promise<ReviewQueueItem> {
  log.warn({ submissionEventId, reason }, "Adding to review queue");

  return db.reviewQueueItem.create({
    data: {
      submissionEventId,
      reason,
    },
  });
}

export async function listReviewQueue(
  db: PrismaClient,
  status?: ReviewStatus,
  limit = 50,
  offset = 0
) {
  return db.reviewQueueItem.findMany({
    where: status ? { status } : undefined,
    include: {
      submissionEvent: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function updateReviewItem(
  db: PrismaClient,
  reviewItemId: string,
  status: ReviewStatus,
  reviewedBy: string,
  reviewNote?: string
): Promise<ReviewQueueItem> {
  log.info({ reviewItemId, status, reviewedBy }, "Updating review item");

  return db.reviewQueueItem.update({
    where: { id: reviewItemId },
    data: {
      status,
      reviewedBy,
      reviewNote: reviewNote ?? null,
    },
  });
}

export async function getReviewItemWithSubmission(
  db: PrismaClient,
  reviewItemId: string
) {
  return db.reviewQueueItem.findUnique({
    where: { id: reviewItemId },
    include: { submissionEvent: true },
  });
}
