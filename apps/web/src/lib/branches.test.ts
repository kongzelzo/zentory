import { describe, expect, it } from "vitest";
import { buildBranchSummaries, buildBranchTotals, filterBranchSummaries, type BranchRecord } from "./branches";

describe("branch inventory summaries", () => {
  const branches: BranchRecord[] = [
    { id: "main", name: "คลังหลัก", code: "MAIN", type: "MAIN_WAREHOUSE", status: "ACTIVE", isDefault: true },
    { id: "store", name: "หน้าร้าน", code: "STORE-01", type: "STORE_FRONT", status: "INACTIVE", isDefault: false }
  ];

  const balances = [
    { branchId: "main", quantity: 5, product: { id: "water", name: "น้ำดื่ม", sku: "WATER", costPrice: "8", minStock: 6 } },
    { branchId: "main", quantity: 0, product: { id: "snack", name: "ขนม", sku: "SNACK", costPrice: "12", minStock: 3 } },
    { branchId: "store", quantity: 10, product: { id: "soap", name: "สบู่", sku: "SOAP", costPrice: "14", minStock: 2 } }
  ];

  it("summarizes stock by real branch balances", () => {
    expect(buildBranchSummaries(branches, balances)).toEqual([
      expect.objectContaining({ id: "main", productCount: 2, stockValue: 40, lowStockCount: 1, outOfStockCount: 1 }),
      expect.objectContaining({ id: "store", productCount: 1, stockValue: 140, lowStockCount: 0, outOfStockCount: 0 })
    ]);
  });

  it("keeps empty branches visible and totals the page overview", () => {
    const summaries = buildBranchSummaries([...branches, { id: "empty", name: "คลังสำรอง", code: "WH-02", type: "SECONDARY_WAREHOUSE", status: "ACTIVE", isDefault: false }], balances);

    expect(summaries.find((branch) => branch.id === "empty")).toEqual(expect.objectContaining({ productCount: 0, stockValue: 0 }));
    expect(buildBranchTotals(summaries)).toEqual({
      totalBranches: 3,
      activeBranches: 2,
      lowStockProducts: 1,
      outOfStockProducts: 1,
      stockValue: 180
    });
  });

  it("filters by name, code, type, and stock alert state", () => {
    const summaries = buildBranchSummaries(branches, balances);

    expect(filterBranchSummaries(summaries, { search: "main", status: "all" }).map((branch) => branch.id)).toEqual(["main"]);
    expect(filterBranchSummaries(summaries, { search: "คลังหลัก", status: "all" }).map((branch) => branch.id)).toEqual(["main"]);
    expect(filterBranchSummaries(summaries, { search: "หน้าร้าน", status: "all" }).map((branch) => branch.id)).toEqual(["store"]);
    expect(filterBranchSummaries(summaries, { search: "หน้าร้าน", status: "inactive" }).map((branch) => branch.id)).toEqual(["store"]);
    expect(filterBranchSummaries(summaries, { search: "", status: "hasLowStock" }).map((branch) => branch.id)).toEqual(["main"]);
    expect(filterBranchSummaries(summaries, { search: "", status: "hasOutOfStock" }).map((branch) => branch.id)).toEqual(["main"]);
  });
});
