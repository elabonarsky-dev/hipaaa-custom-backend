import { Prisma, type PrismaClient, type FormType, type Member } from "@/prisma";
import { jotformPayloadSchema, extractFields } from "./schema";
import { computeIdempotencyKey, checkAndRecordIdempotency } from "./idempotency";
import {
  findMemberByCin,
  createMember,
  advanceMemberStage,
  checkConflict,
} from "../members";
import type { MemberUpsertData } from "../members";
import { forwardToVanillaSoft } from "../vanillasoft";
import { processSharePointUploads } from "../sharepoint";
import { writeAuditLog } from "../audit";
import { addToReviewQueue } from "../review";
import {
  normalizeCin,
  normalizeName,
  normalizePhone,
  normalizeEmail,
  parseDateSafe,
  hashPayload,
  maskCin,
  createChildLogger,
} from "../../utils";

const log = createChildLogger({ module: "processor" });

export interface ProcessingResult {
  success: boolean;
  action: string;
  submissionEventId?: string;
  memberId?: string;
  reviewQueued?: boolean;
  error?: string;
}

export async function processSubmission(
  db: PrismaClient,
  formType: FormType,
  rawBody: Record<string, unknown>
): Promise<ProcessingResult> {
  const parsed = jotformPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    log.warn({ errors: parsed.error.flatten() }, "Payload validation failed");
  }

  const payload = parsed.success ? parsed.data : rawBody;
  const fields = extractFields(payload as ReturnType<typeof jotformPayloadSchema.parse>);

  const cinNormalized = normalizeCin(fields.cinRaw);
  const firstName = normalizeName(fields.firstName);
  const lastName = normalizeName(fields.lastName);
  const dob = parseDateSafe(fields.dob);
  const phone = normalizePhone(fields.phone);
  const email = normalizeEmail(fields.email);
  const payloadHash = hashPayload(rawBody);

  log.info(
    { formType, cin: maskCin(cinNormalized), submissionId: fields.submissionId },
    "Processing submission"
  );

  const idempotencyKey = computeIdempotencyKey(fields.submissionId, rawBody);
  const isDuplicate = await checkAndRecordIdempotency(db, idempotencyKey);

  if (isDuplicate) {
    await writeAuditLog(db, "SUBMISSION_DUPLICATE", "Duplicate submission skipped", {
      formType,
      idempotencyKey,
      cin: maskCin(cinNormalized),
    });
    return { success: true, action: "DUPLICATE_SKIPPED" };
  }

  const submissionEvent = await db.submissionEvent.create({
    data: {
      formType,
      jotformSubmissionId: fields.submissionId,
      payloadHash,
      rawPayload: rawBody as Prisma.InputJsonValue,
      cinNormalized,
      status: "PROCESSING",
    },
  });

  await writeAuditLog(db, "SUBMISSION_RECEIVED", `${formType} submission received`, {
    submissionEventId: submissionEvent.id,
    cin: maskCin(cinNormalized),
  });

  if (!cinNormalized) {
    await sendToReview(db, submissionEvent.id, "Missing CIN / Medicaid ID");
    await writeAuditLog(db, "MISSING_CIN", "Submission missing CIN", {
      submissionEventId: submissionEvent.id,
    });
    return {
      success: true,
      action: "REVIEW_QUEUED",
      submissionEventId: submissionEvent.id,
      reviewQueued: true,
    };
  }

  try {
    const result = await applyFormRules(db, formType, submissionEvent.id, {
      cinNormalized,
      cinRaw: fields.cinRaw ?? cinNormalized,
      firstName,
      lastName,
      dob,
      phone,
      email,
      fileUrls: fields.fileUrls,
      rawBody,
      submissionId: fields.submissionId ?? submissionEvent.id,
    });

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    log.error({ err, submissionEventId: submissionEvent.id }, "Processing failed");

    await db.submissionEvent.update({
      where: { id: submissionEvent.id },
      data: { status: "FAILED", errorMessage: errorMsg },
    });

    await sendToReview(db, submissionEvent.id, `Processing error: ${errorMsg}`);
    return {
      success: false,
      action: "FAILED",
      submissionEventId: submissionEvent.id,
      reviewQueued: true,
      error: errorMsg,
    };
  }
}

interface FormRuleContext {
  cinNormalized: string;
  cinRaw: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  fileUrls: string[];
  rawBody: Record<string, unknown>;
  submissionId: string;
}

async function applyFormRules(
  db: PrismaClient,
  formType: FormType,
  submissionEventId: string,
  ctx: FormRuleContext
): Promise<ProcessingResult> {
  const existingMember = await findMemberByCin(db, ctx.cinNormalized);
  const memberData: MemberUpsertData = {
    cinNormalized: ctx.cinNormalized,
    cinRaw: ctx.cinRaw,
    firstName: ctx.firstName,
    lastName: ctx.lastName,
    dob: ctx.dob,
    phone: ctx.phone,
    email: ctx.email,
  };

  switch (formType) {
    case "REFERRAL":
      return handleReferral(db, submissionEventId, existingMember, memberData, ctx);
    case "INTAKE":
      return handleIntake(db, submissionEventId, existingMember, memberData, ctx);
    case "ENROLLMENT":
      return handleEnrollment(db, submissionEventId, existingMember, memberData, ctx);
    default:
      throw new Error(`Unknown form type: ${formType}`);
  }
}

async function handleReferral(
  db: PrismaClient,
  submissionEventId: string,
  existingMember: Awaited<ReturnType<typeof findMemberByCin>>,
  memberData: MemberUpsertData,
  ctx: FormRuleContext
): Promise<ProcessingResult> {
  if (existingMember) {
    const conflict = checkConflict(existingMember, memberData);
    if (conflict.hasConflict) {
      await writeAuditLog(db, "CONFLICT_DETECTED", "CIN match with data mismatch", {
        submissionEventId,
        reason: conflict.reason,
      });
      await sendToReview(
        db,
        submissionEventId,
        `Conflict: ${conflict.reason}`
      );
      return {
        success: true,
        action: "REVIEW_QUEUED",
        submissionEventId,
        memberId: existingMember.id,
        reviewQueued: true,
      };
    }

    await sendToReview(
      db,
      submissionEventId,
      "Duplicate referral: member already exists with this CIN"
    );
    return {
      success: true,
      action: "REVIEW_QUEUED",
      submissionEventId,
      memberId: existingMember.id,
      reviewQueued: true,
    };
  }

  let member: Member;
  try {
    member = await createMember(db, memberData, "REFERRAL");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const raced = await findMemberByCin(db, ctx.cinNormalized);
      if (raced) {
        await sendToReview(
          db,
          submissionEventId,
          "Duplicate referral: member was created concurrently for the same CIN"
        );
        return {
          success: true,
          action: "REVIEW_QUEUED",
          submissionEventId,
          memberId: raced.id,
          reviewQueued: true,
        };
      }
    }
    throw e;
  }

  await writeAuditLog(db, "MEMBER_CREATED", "New member from referral", {
    memberId: member.id,
    cin: maskCin(ctx.cinNormalized),
  });

  const vsResult = await forwardToVanillaSoft("REFERRAL", ctx.rawBody, ctx.cinNormalized);
  await recordVsResult(db, submissionEventId, vsResult);

  if (!vsResult.success) {
    await sendToReview(db, submissionEventId, `VS forward failed: ${vsResult.body}`);
    return {
      success: false,
      action: "VS_FORWARD_FAILED",
      submissionEventId,
      memberId: member.id,
      reviewQueued: true,
    };
  }

  return {
    success: true,
    action: "REFERRAL_CREATED",
    submissionEventId,
    memberId: member.id,
  };
}

async function handleIntake(
  db: PrismaClient,
  submissionEventId: string,
  existingMember: Awaited<ReturnType<typeof findMemberByCin>>,
  memberData: MemberUpsertData,
  ctx: FormRuleContext
): Promise<ProcessingResult> {
  if (!existingMember) {
    await sendToReview(
      db,
      submissionEventId,
      "No existing member found for intake submission"
    );
    return {
      success: true,
      action: "REVIEW_QUEUED",
      submissionEventId,
      reviewQueued: true,
    };
  }

  const conflict = checkConflict(existingMember, memberData);
  if (conflict.hasConflict) {
    await writeAuditLog(db, "CONFLICT_DETECTED", "Intake CIN match with data mismatch", {
      submissionEventId,
      reason: conflict.reason,
    });
    await sendToReview(db, submissionEventId, `Conflict: ${conflict.reason}`);
    return {
      success: true,
      action: "REVIEW_QUEUED",
      submissionEventId,
      memberId: existingMember.id,
      reviewQueued: true,
    };
  }

  const vsResult = await forwardToVanillaSoft("INTAKE", ctx.rawBody, ctx.cinNormalized);
  await recordVsResult(db, submissionEventId, vsResult);

  if (!vsResult.success) {
    await sendToReview(db, submissionEventId, `VS forward failed: ${vsResult.body}`);
    return {
      success: false,
      action: "VS_FORWARD_FAILED",
      submissionEventId,
      memberId: existingMember.id,
      reviewQueued: true,
    };
  }

  await advanceMemberStage(db, existingMember.id, "INTAKE", memberData);
  await writeAuditLog(db, "MEMBER_UPDATED", "Member updated via intake", {
    memberId: existingMember.id,
  });

  return {
    success: true,
    action: "INTAKE_PROCESSED",
    submissionEventId,
    memberId: existingMember.id,
  };
}

async function handleEnrollment(
  db: PrismaClient,
  submissionEventId: string,
  existingMember: Awaited<ReturnType<typeof findMemberByCin>>,
  memberData: MemberUpsertData,
  ctx: FormRuleContext
): Promise<ProcessingResult> {
  if (!existingMember) {
    await sendToReview(
      db,
      submissionEventId,
      "No existing member found for enrollment submission"
    );
    return {
      success: true,
      action: "REVIEW_QUEUED",
      submissionEventId,
      reviewQueued: true,
    };
  }

  const conflict = checkConflict(existingMember, memberData);
  if (conflict.hasConflict) {
    await writeAuditLog(db, "CONFLICT_DETECTED", "Enrollment CIN match with data mismatch", {
      submissionEventId,
      reason: conflict.reason,
    });
    await sendToReview(db, submissionEventId, `Conflict: ${conflict.reason}`);
    return {
      success: true,
      action: "REVIEW_QUEUED",
      submissionEventId,
      memberId: existingMember.id,
      reviewQueued: true,
    };
  }

  const vsResult = await forwardToVanillaSoft("ENROLLMENT", ctx.rawBody, ctx.cinNormalized);
  await recordVsResult(db, submissionEventId, vsResult);

  if (!vsResult.success) {
    await sendToReview(db, submissionEventId, `VS forward failed: ${vsResult.body}`);
    return {
      success: false,
      action: "VS_FORWARD_FAILED",
      submissionEventId,
      memberId: existingMember.id,
      reviewQueued: true,
    };
  }

  await advanceMemberStage(db, existingMember.id, "ENROLLMENT", memberData);
  await writeAuditLog(db, "MEMBER_UPDATED", "Member updated via enrollment", {
    memberId: existingMember.id,
  });

  if (ctx.fileUrls.length > 0) {
    try {
      await processSharePointUploads(
        db,
        existingMember.id,
        ctx.fileUrls,
        ctx.cinNormalized,
        "ENROLLMENT",
        ctx.submissionId
      );
      await writeAuditLog(db, "SHAREPOINT_UPLOAD_SUCCESS", "SharePoint files uploaded", {
        memberId: existingMember.id,
        fileCount: ctx.fileUrls.length,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown";
      await writeAuditLog(db, "SHAREPOINT_UPLOAD_FAILURE", "SharePoint upload failed", {
        memberId: existingMember.id,
        error: errorMsg,
      });
    }
  }

  return {
    success: true,
    action: "ENROLLMENT_PROCESSED",
    submissionEventId,
    memberId: existingMember.id,
  };
}

async function sendToReview(
  db: PrismaClient,
  submissionEventId: string,
  reason: string
): Promise<void> {
  await db.submissionEvent.update({
    where: { id: submissionEventId },
    data: { status: "REVIEW" },
  });
  await addToReviewQueue(db, submissionEventId, reason);
  await writeAuditLog(db, "REVIEW_QUEUED", reason, { submissionEventId });
}

async function recordVsResult(
  db: PrismaClient,
  submissionEventId: string,
  result: { success: boolean; statusCode: number; body: string }
): Promise<void> {
  await db.submissionEvent.update({
    where: { id: submissionEventId },
    data: {
      status: result.success ? "FORWARDED" : "FAILED",
      vsResponseCode: result.statusCode,
      vsResponseBody: result.body.slice(0, 2000),
      errorMessage: result.success ? null : result.body.slice(0, 500),
    },
  });

  await writeAuditLog(
    db,
    result.success ? "VS_FORWARD_SUCCESS" : "VS_FORWARD_FAILURE",
    result.success ? "Forwarded to VanillaSoft" : "VanillaSoft forward failed",
    { submissionEventId, statusCode: result.statusCode }
  );
}
