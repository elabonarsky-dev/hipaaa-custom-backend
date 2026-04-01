import type { PrismaClient } from "@prisma/client";
import { hashPayload, createChildLogger } from "../../utils";

const log = createChildLogger({ module: "idempotency" });

/**
 * Returns the idempotency key for a submission.
 * Primary: jotformSubmissionId. Fallback: payload hash.
 */
export function computeIdempotencyKey(
  submissionId: string | null,
  payload: Record<string, unknown>
): string {
  if (submissionId) return `jotform:${submissionId}`;
  return `hash:${hashPayload(payload)}`;
}

/**
 * Returns true if this key has been seen before (i.e. it's a duplicate).
 * If not seen, records it and returns false.
 */
export async function checkAndRecordIdempotency(
  db: PrismaClient,
  key: string
): Promise<boolean> {
  const existing = await db.idempotencyKey.findUnique({ where: { key } });

  if (existing) {
    log.info({ key }, "Duplicate submission detected");
    return true;
  }

  await db.idempotencyKey.create({ data: { key } });
  return false;
}
