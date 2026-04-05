import { describe, it, expect, vi, beforeEach } from "vitest";
import { processSubmission } from "./processor";
import { forwardToVanillaSoft } from "../vanillasoft";

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

function createMockDb() {
  return {
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "idem-1", key: "test" }),
    },
    submissionEvent: {
      create: vi.fn().mockResolvedValue({
        id: "sub-1",
        formType: "REFERRAL",
        status: "PROCESSING",
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    reviewQueueItem: {
      create: vi.fn().mockResolvedValue({ id: "review-1" }),
    },
    member: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        return Promise.resolve({
          id: "member-1",
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    sharePointDocument: {
      create: vi.fn(),
      update: vi.fn(),
    },
  } as unknown;
}

vi.mock("../../config", () => ({
  getEnv: () => ({
    DATABASE_URL: "test",
    VS_REFERRAL_POST_URL: "https://test.vanillasoft.net/referral",
    VS_INTAKE_POST_URL: "https://test.vanillasoft.net/intake",
    VS_ENROLLMENT_POST_URL: "https://test.vanillasoft.net/enrollment",
    ADMIN_API_KEY: "test",
  }),
  getVsUrl: (formType: string) => `https://test.vanillasoft.net/${formType.toLowerCase()}`,
}));

vi.mock("../vanillasoft", () => ({
  forwardToVanillaSoft: vi.fn().mockResolvedValue({
    success: true,
    statusCode: 200,
    body: "OK",
  }),
}));

vi.mock("../sharepoint", () => ({
  processSharePointUploads: vi.fn().mockResolvedValue(undefined),
}));

describe("processSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(forwardToVanillaSoft).mockResolvedValue({
      success: true,
      statusCode: 200,
      body: "OK",
    });
  });

  it("queues to review when CIN is missing", async () => {
    const db = createMockDb();
    const result = await processSubmission(
      db as never,
      "REFERRAL",
      { first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("REVIEW_QUEUED");
    expect(result.reviewQueued).toBe(true);
  });

  it("skips duplicate submissions via idempotency", async () => {
    const db = createMockDb();
    (db as { idempotencyKey: { findUnique: ReturnType<typeof vi.fn> } }).idempotencyKey.findUnique.mockResolvedValue({
      id: "existing",
      key: "jotform:12345",
    });

    const result = await processSubmission(
      db as never,
      "REFERRAL",
      { submissionID: "12345", cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("DUPLICATE_SKIPPED");
  });

  it("creates member and forwards for new referral with CIN", async () => {
    const db = createMockDb();
    const result = await processSubmission(
      db as never,
      "REFERRAL",
      { cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("REFERRAL_CREATED");
    expect(result.memberId).toBeDefined();
  });

  it("queues intake to review when no existing member", async () => {
    const db = createMockDb();
    const result = await processSubmission(
      db as never,
      "INTAKE",
      { cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("REVIEW_QUEUED");
    expect(result.reviewQueued).toBe(true);
  });

  it("queues enrollment to review when no existing member", async () => {
    const db = createMockDb();
    const result = await processSubmission(
      db as never,
      "ENROLLMENT",
      { cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("REVIEW_QUEUED");
    expect(result.reviewQueued).toBe(true);
  });

  it("processes intake when member exists and data matches", async () => {
    const db = createMockDb();
    const existingMember = {
      id: "member-1",
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "John",
      lastName: "Doe",
      dob: null,
      phone: null,
      email: null,
      currentStage: "REFERRAL",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (db as { member: { findUnique: ReturnType<typeof vi.fn>; findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } }).member.findUnique.mockResolvedValue(existingMember);
    (db as { member: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } }).member.findUniqueOrThrow.mockResolvedValue(existingMember);
    (db as { member: { update: ReturnType<typeof vi.fn> } }).member.update.mockResolvedValue({
      ...existingMember,
      currentStage: "INTAKE",
    });

    const result = await processSubmission(
      db as never,
      "INTAKE",
      { cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("INTAKE_PROCESSED");
  });

  it("does not advance member stage when intake VS forward fails", async () => {
    vi.mocked(forwardToVanillaSoft).mockResolvedValueOnce({
      success: false,
      statusCode: 500,
      body: "VS error",
    });

    const db = createMockDb();
    const existingMember = {
      id: "member-1",
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "John",
      lastName: "Doe",
      dob: null,
      phone: null,
      email: null,
      currentStage: "REFERRAL",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (db as { member: { findUnique: ReturnType<typeof vi.fn> } }).member.findUnique.mockResolvedValue(
      existingMember
    );

    const result = await processSubmission(
      db as never,
      "INTAKE",
      { cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("VS_FORWARD_FAILED");
    expect((db as { member: { update: ReturnType<typeof vi.fn> } }).member.update).not.toHaveBeenCalled();
  });

  it("does not advance member stage when enrollment VS forward fails", async () => {
    vi.mocked(forwardToVanillaSoft).mockResolvedValueOnce({
      success: false,
      statusCode: 502,
      body: "bad gateway",
    });

    const db = createMockDb();
    const existingMember = {
      id: "member-1",
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "John",
      lastName: "Doe",
      dob: null,
      phone: null,
      email: null,
      currentStage: "INTAKE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (db as { member: { findUnique: ReturnType<typeof vi.fn> } }).member.findUnique.mockResolvedValue(
      existingMember
    );

    const result = await processSubmission(
      db as never,
      "ENROLLMENT",
      { cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("VS_FORWARD_FAILED");
    expect((db as { member: { update: ReturnType<typeof vi.fn> } }).member.update).not.toHaveBeenCalled();
    expect((db as { sharePointDocument: { create: ReturnType<typeof vi.fn> } }).sharePointDocument.create).not.toHaveBeenCalled();
  });

  it("detects conflict when CIN matches but name differs", async () => {
    const db = createMockDb();
    (db as { member: { findUnique: ReturnType<typeof vi.fn> } }).member.findUnique.mockResolvedValue({
      id: "member-1",
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "Jane",
      lastName: "Smith",
      dob: null,
      phone: null,
      email: null,
      currentStage: "REFERRAL",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processSubmission(
      db as never,
      "REFERRAL",
      { cin: "AB1234", first_name: "John", last_name: "Doe" }
    );

    expect(result.action).toBe("REVIEW_QUEUED");
    expect(result.reviewQueued).toBe(true);
  });
});
