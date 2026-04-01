import type { PrismaClient, Member, MemberStage } from "@prisma/client";
import { maskCin, createChildLogger } from "../../utils";

const log = createChildLogger({ module: "members" });

export interface MemberUpsertData {
  cinNormalized: string;
  cinRaw: string;
  firstName: string;
  lastName: string;
  dob?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  reason?: string;
  existingMember?: Member;
}

const STAGE_ORDER: Record<MemberStage, number> = {
  REFERRAL: 0,
  INTAKE: 1,
  ENROLLMENT: 2,
};

export async function findMemberByCin(
  db: PrismaClient,
  cinNormalized: string
): Promise<Member | null> {
  return db.member.findUnique({ where: { cinNormalized } });
}

export async function createMember(
  db: PrismaClient,
  data: MemberUpsertData,
  stage: MemberStage
): Promise<Member> {
  log.info({ cin: maskCin(data.cinNormalized), stage }, "Creating new member");
  return db.member.create({
    data: {
      cinNormalized: data.cinNormalized,
      cinRaw: data.cinRaw,
      firstName: data.firstName,
      lastName: data.lastName,
      dob: data.dob ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      currentStage: stage,
    },
  });
}

export async function advanceMemberStage(
  db: PrismaClient,
  memberId: string,
  newStage: MemberStage,
  updateData?: Partial<MemberUpsertData>
): Promise<Member> {
  const member = await db.member.findUniqueOrThrow({ where: { id: memberId } });
  const currentOrder = STAGE_ORDER[member.currentStage];
  const newOrder = STAGE_ORDER[newStage];

  const effectiveStage = newOrder > currentOrder ? newStage : member.currentStage;

  log.info(
    { memberId, from: member.currentStage, to: effectiveStage },
    "Updating member stage"
  );

  return db.member.update({
    where: { id: memberId },
    data: {
      currentStage: effectiveStage,
      ...(updateData?.firstName && { firstName: updateData.firstName }),
      ...(updateData?.lastName && { lastName: updateData.lastName }),
      ...(updateData?.dob && { dob: updateData.dob }),
      ...(updateData?.phone && { phone: updateData.phone }),
      ...(updateData?.email && { email: updateData.email }),
    },
  });
}

export function checkConflict(
  existing: Member,
  incoming: MemberUpsertData
): ConflictCheckResult {
  const reasons: string[] = [];

  const existFirst = existing.firstName.toLowerCase().trim();
  const incomingFirst = incoming.firstName.toLowerCase().trim();
  if (existFirst !== incomingFirst && incomingFirst.length > 0) {
    reasons.push(
      `First name mismatch: existing="${existing.firstName}", incoming="${incoming.firstName}"`
    );
  }

  const existLast = existing.lastName.toLowerCase().trim();
  const incomingLast = incoming.lastName.toLowerCase().trim();
  if (existLast !== incomingLast && incomingLast.length > 0) {
    reasons.push(
      `Last name mismatch: existing="${existing.lastName}", incoming="${incoming.lastName}"`
    );
  }

  if (existing.dob && incoming.dob && existing.dob !== incoming.dob) {
    reasons.push(
      `DOB mismatch: existing="${existing.dob}", incoming="${incoming.dob}"`
    );
  }

  if (reasons.length > 0) {
    return {
      hasConflict: true,
      reason: reasons.join("; "),
      existingMember: existing,
    };
  }

  return { hasConflict: false, existingMember: existing };
}
