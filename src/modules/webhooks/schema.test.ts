import { describe, it, expect } from "vitest";
import { extractFields, jotformPayloadSchema } from "./schema";

describe("extractFields", () => {
  it("extracts CIN from 'cin' field", () => {
    const result = extractFields({ cin: "AB1234" });
    expect(result.cinRaw).toBe("AB1234");
  });

  it("extracts CIN from 'CIN' field", () => {
    const result = extractFields({ CIN: "AB1234" });
    expect(result.cinRaw).toBe("AB1234");
  });

  it("extracts CIN from 'medicaid_id' field", () => {
    const result = extractFields({ medicaid_id: "AB1234" });
    expect(result.cinRaw).toBe("AB1234");
  });

  it("extracts CIN from 'medicaidId' field", () => {
    const result = extractFields({ medicaidId: "AB1234" });
    expect(result.cinRaw).toBe("AB1234");
  });

  it("prefers cin over medicaid_id", () => {
    const result = extractFields({ cin: "FIRST", medicaid_id: "SECOND" });
    expect(result.cinRaw).toBe("FIRST");
  });

  it("extracts names from snake_case fields", () => {
    const result = extractFields({ first_name: "John", last_name: "Doe" });
    expect(result.firstName).toBe("John");
    expect(result.lastName).toBe("Doe");
  });

  it("extracts names from camelCase fields", () => {
    const result = extractFields({ firstName: "Jane", lastName: "Smith" });
    expect(result.firstName).toBe("Jane");
    expect(result.lastName).toBe("Smith");
  });

  it("extracts submissionID", () => {
    const result = extractFields({ submissionID: "12345" });
    expect(result.submissionId).toBe("12345");
  });

  it("coerces numeric submissionID to string", () => {
    const result = extractFields({ submissionID: 5001234567 } as never);
    expect(result.submissionId).toBe("5001234567");
  });

  it("extracts submission_id snake_case", () => {
    const result = extractFields({ submission_id: "99" });
    expect(result.submissionId).toBe("99");
  });

  it("prefers submissionID over submission_id", () => {
    const result = extractFields({ submissionID: "1", submission_id: "2" });
    expect(result.submissionId).toBe("1");
  });

  it("parses comma-separated file_urls", () => {
    const result = extractFields({
      file_urls: "https://a.com/f1.pdf,https://a.com/f2.pdf",
    });
    expect(result.fileUrls).toEqual([
      "https://a.com/f1.pdf",
      "https://a.com/f2.pdf",
    ]);
  });

  it("parses array file_urls", () => {
    const result = extractFields({
      file_urls: ["https://a.com/f1.pdf", "https://a.com/f2.pdf"],
    });
    expect(result.fileUrls).toEqual([
      "https://a.com/f1.pdf",
      "https://a.com/f2.pdf",
    ]);
  });

  it("returns empty array when no file_urls", () => {
    const result = extractFields({});
    expect(result.fileUrls).toEqual([]);
  });

  it("handles DOB variants", () => {
    expect(extractFields({ dob: "01/15/1990" }).dob).toBe("01/15/1990");
    expect(extractFields({ date_of_birth: "1990-01-15" }).dob).toBe("1990-01-15");
    expect(extractFields({ dateOfBirth: "1990-01-15" }).dob).toBe("1990-01-15");
  });

  it("returns null for missing optional fields", () => {
    const result = extractFields({});
    expect(result.cinRaw).toBeNull();
    expect(result.submissionId).toBeNull();
    expect(result.dob).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
  });
});

describe("jotformPayloadSchema", () => {
  it("accepts a minimal payload", () => {
    const result = jotformPayloadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a full payload", () => {
    const result = jotformPayloadSchema.safeParse({
      submissionID: "123",
      cin: "AB1234",
      first_name: "John",
      last_name: "Doe",
      dob: "01/15/1990",
      phone: "555-1234",
      email: "john@test.com",
      file_urls: ["https://example.com/file.pdf"],
    });
    expect(result.success).toBe(true);
  });

  it("coerces numeric submissionID through Zod", () => {
    const result = jotformPayloadSchema.safeParse({ submissionID: 42 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.submissionID).toBe("42");
    }
  });
});
