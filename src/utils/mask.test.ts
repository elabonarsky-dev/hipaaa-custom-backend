import { describe, it, expect } from "vitest";
import { maskCin } from "./mask";

describe("maskCin", () => {
  it("masks all but last 4 characters", () => {
    expect(maskCin("AB12CD34")).toBe("****CD34");
  });

  it("masks short CINs completely", () => {
    expect(maskCin("AB")).toBe("****");
  });

  it("handles exactly 4 characters", () => {
    expect(maskCin("ABCD")).toBe("****");
  });

  it("returns placeholder for null", () => {
    expect(maskCin(null)).toBe("[NO-CIN]");
  });

  it("returns placeholder for undefined", () => {
    expect(maskCin(undefined)).toBe("[NO-CIN]");
  });
});
