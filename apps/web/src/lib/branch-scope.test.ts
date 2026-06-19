import { describe, expect, it } from "vitest";
import { branchScopedPath, dashboardPath, stockAlertPath } from "./branch-scope";

describe("branch scoped paths", () => {
  it("adds the working branch to unscoped paths", () => {
    expect(branchScopedPath("/reports/dashboard", "branch_moon")).toBe("/reports/dashboard?branchId=branch_moon");
  });

  it("keeps existing query params and appends the working branch", () => {
    expect(branchScopedPath("/products?status=ACTIVE", "branch_moon")).toBe("/products?status=ACTIVE&branchId=branch_moon");
  });

  it("does not override an explicit warehouse scope", () => {
    expect(branchScopedPath("/reports/stock?warehouseId=warehouse_1", "branch_moon")).toBe("/reports/stock?warehouseId=warehouse_1");
  });

  it("builds dashboard and stock alert paths from the working branch", () => {
    expect(dashboardPath("branch_moon")).toBe("/reports/dashboard?branchId=branch_moon");
    expect(stockAlertPath("branch_moon")).toBe("/reports/stock?branchId=branch_moon");
  });
});
