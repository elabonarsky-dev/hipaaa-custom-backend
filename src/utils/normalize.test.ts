import { describe, it, expect } from "vitest";
import {
  normalizeCin,
  normalizeName,
  normalizePhone,
  normalizeEmail,
  parseDateSafe,
} from "./normalize";

describe("normalizeCin", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizeCin("ab 12 cd")).toBe("AB12CD");
  });

  it("strips dashes", () => {
    expect(normalizeCin("AB-12-CD")).toBe("AB12CD");
  });

  it("returns null for empty string", () => {
    expect(normalizeCin("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizeCin(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeCin(undefined)).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(normalizeCin("   ")).toBeNull();
  });

  it("handles already-clean input", () => {
    expect(normalizeCin("AB12CD34")).toBe("AB12CD34");
  });
});

describe("normalizeName", () => {
  it("trims whitespace", () => {
    expect(normalizeName("  John  ")).toBe("John");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeName("John   Doe")).toBe("John Doe");
  });

  it("returns empty string for null", () => {
    expect(normalizeName(null)).toBe("");
  });
});

describe("normalizePhone", () => {
  it("strips non-digits", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
  });

  it("strips leading 1 from 11-digit numbers", () => {
    expect(normalizePhone("1-555-123-4567")).toBe("5551234567");
  });

  it("returns null for empty input", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  John@Example.COM  ")).toBe("john@example.com");
  });

  it("returns null for empty string", () => {
    expect(normalizeEmail("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("parseDateSafe", () => {
  it("parses MM/DD/YYYY", () => {
    expect(parseDateSafe("01/15/1990")).toBe("1990-01-15");
  });

  it("parses M/D/YYYY", () => {
    expect(parseDateSafe("1/5/1990")).toBe("1990-01-05");
  });

  it("parses MM-DD-YYYY", () => {
    expect(parseDateSafe("01-15-1990")).toBe("1990-01-15");
  });

  it("passes through ISO dates", () => {
    expect(parseDateSafe("1990-01-15")).toBe("1990-01-15");
  });

  it("returns null for null", () => {
    expect(parseDateSafe(null)).toBeNull();
  });

  it("returns raw string for unrecognized formats", () => {
    expect(parseDateSafe("Jan 15, 1990")).toBe("Jan 15, 1990");
  });
});
