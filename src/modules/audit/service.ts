import type { PrismaClient, Prisma } from "@prisma/client";
import { createChildLogger } from "../../utils";

const log = createChildLogger({ module: "audit" });

export type AuditEventType =
  | "SUBMISSION_RECEIVED"
  | "SUBMISSION_DUPLICATE"
  | "MEMBER_CREATED"
  | "MEMBER_UPDATED"
  | "VS_FORWARD_SUCCESS"
  | "VS_FORWARD_FAILURE"
  | "SHAREPOINT_UPLOAD_SUCCESS"
  | "SHAREPOINT_UPLOAD_FAILURE"
  | "REVIEW_QUEUED"
  | "REVIEW_APPROVED"
  | "REVIEW_REJECTED"
  | "REPLAY_TRIGGERED"
  | "CONFLICT_DETECTED"
  | "MISSING_CIN";

export async function writeAuditLog(
  db: PrismaClient,
  eventType: AuditEventType,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  log.info({ eventType, message }, "Audit event");

  await db.auditLog.create({
    data: {
      eventType,
      message,
      metadataJson: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
