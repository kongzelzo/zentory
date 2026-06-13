import { describe, expect, it } from "vitest";
import { baht, number } from "./format";

describe("format helpers", () => {
  it("formats Thai baht values without decimals", () => {
    expect(baht(18420)).toContain("18,420");
  });

  it("formats inventory counts", () => {
    expect(number(1284)).toBe("1,284");
  });
});
