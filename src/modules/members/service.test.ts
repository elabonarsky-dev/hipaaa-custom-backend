import { describe, it, expect } from "vitest";
import { checkConflict } from "./service";
import type { Member } from "@/prisma";

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    cinNormalized: "AB1234",
    cinRaw: "AB 1234",
    firstName: "John",
    lastName: "Doe",
    dob: "1990-01-15",
    phone: "5551234567",
    email: "john@test.com",
    currentStage: "REFERRAL",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("checkConflict", () => {
  it("returns no conflict when names and DOB match", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "John",
      lastName: "Doe",
      dob: "1990-01-15",
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(false);
  });

  it("detects first name mismatch", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "Jane",
      lastName: "Doe",
      dob: "1990-01-15",
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(true);
    expect(result.reason).toContain("First name mismatch");
  });

  it("detects last name mismatch", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "John",
      lastName: "Smith",
      dob: "1990-01-15",
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(true);
    expect(result.reason).toContain("Last name mismatch");
  });

  it("detects DOB mismatch", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "John",
      lastName: "Doe",
      dob: "1985-06-20",
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(true);
    expect(result.reason).toContain("DOB mismatch");
  });

  it("reports multiple mismatches", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "Jane",
      lastName: "Smith",
      dob: "1985-06-20",
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(true);
    expect(result.reason).toContain("First name");
    expect(result.reason).toContain("Last name");
    expect(result.reason).toContain("DOB");
  });

  it("is case-insensitive for name comparison", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "john",
      lastName: "doe",
      dob: "1990-01-15",
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(false);
  });

  it("ignores empty incoming name", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "",
      lastName: "",
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(false);
  });

  it("skips DOB check when incoming DOB is null", () => {
    const existing = makeMember();
    const incoming = {
      cinNormalized: "AB1234",
      cinRaw: "AB 1234",
      firstName: "John",
      lastName: "Doe",
      dob: null,
    };

    const result = checkConflict(existing, incoming);
    expect(result.hasConflict).toBe(false);
  });
});
