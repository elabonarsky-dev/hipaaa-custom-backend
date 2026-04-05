import { Prisma, type PrismaClient } from "@/prisma";
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

  try {
    await db.idempotencyKey.create({ data: { key } });
    return false;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      log.info({ key }, "Duplicate submission detected (concurrent insert)");
      return true;
    }
    throw e;
  }
}

/** Removes a recorded idempotency key (e.g. before admin replay of the same JotForm submission). */
export async function deleteIdempotencyKey(
  db: PrismaClient,
  key: string
): Promise<void> {
  await db.idempotencyKey.deleteMany({ where: { key } });
}
