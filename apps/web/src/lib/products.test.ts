import { describe, expect, it } from "vitest";
import { countsTowardProductLimit, getProductImageUrl, getProductProfitMetrics, getProductStockAlert, getProductSummary, getStockBadge, getStockState, matchesProductSearch, stockOf, validateProductImageFile, type ProductForSummary } from "./products";

function product(overrides: Partial<ProductForSummary> = {}): ProductForSummary {
  return {
    id: "product-1",
    name: "น้ำดื่ม",
    sku: "DRINK-001",
    unit: "ชิ้น",
    costPrice: "10",
    salePrice: "15",
    minStock: 5,
    status: "ACTIVE",
    balances: [{ quantity: 12 }],
    ...overrides
  };
}

describe("product helpers", () => {
  it("totals stock across balances", () => {
    expect(stockOf(product({ balances: [{ quantity: 3 }, { quantity: 7 }] }))).toBe(10);
  });

  it("marks stock as out, low, or healthy", () => {
    expect(getStockBadge(product({ balances: [{ quantity: 0 }] }))).toMatchObject({ label: "หมดสต็อก", tone: "danger" });
    expect(getStockBadge(product({ balances: [{ quantity: 5 }] }))).toMatchObject({ label: "ใกล้หมด", tone: "warning" });
    expect(getStockBadge(product({ balances: [{ quantity: 6 }] }))).toMatchObject({ label: "ปกติ", tone: "success" });
  });

  it("classifies stock state for client-side filtering", () => {
    expect(getStockState(product({ balances: [{ quantity: -1 }] }))).toBe("OUT");
    expect(getStockState(product({ balances: [{ quantity: 0 }] }))).toBe("OUT");
    expect(getStockState(product({ minStock: 5, balances: [{ quantity: 1 }] }))).toBe("LOW");
    expect(getStockState(product({ minStock: 5, balances: [{ quantity: 5 }] }))).toBe("LOW");
    expect(getStockState(product({ minStock: 5, balances: [{ quantity: 6 }] }))).toBe("OK");
  });

  it("builds stock alerts only for out-of-stock and low-stock products", () => {
    expect(getProductStockAlert(product({ balances: [{ quantity: 0 }], minStock: 5 }))).toMatchObject({
      tone: "danger",
      title: "สินค้าหมดสต็อก"
    });
    expect(getProductStockAlert(product({ balances: [{ quantity: 3 }], minStock: 5 }))).toMatchObject({
      tone: "warning",
      title: "สินค้าใกล้หมด"
    });
    expect(getProductStockAlert(product({ balances: [{ quantity: 6 }], minStock: 5 }))).toBeUndefined();
  });

  it("calculates product profit and margin from sale and cost prices", () => {
    expect(getProductProfitMetrics(product({ costPrice: "10", salePrice: "25" }))).toEqual({
      costPrice: 10,
      salePrice: 25,
      profit: 15,
      marginPercent: 60
    });
    expect(getProductProfitMetrics(product({ costPrice: "10", salePrice: "0" }))).toMatchObject({
      profit: -10,
      marginPercent: undefined
    });
  });

  it("counts active, paused, and stocked discontinued products toward package limit", () => {
    expect(countsTowardProductLimit(product({ status: "ACTIVE" }))).toBe(true);
    expect(countsTowardProductLimit(product({ status: "PAUSED" }))).toBe(true);
    expect(countsTowardProductLimit(product({ status: "DISCONTINUED", balances: [{ quantity: 2 }] }))).toBe(true);
    expect(countsTowardProductLimit(product({ status: "DISCONTINUED", balances: [{ quantity: 0 }] }))).toBe(false);
    expect(countsTowardProductLimit(product({ status: "ARCHIVED" }))).toBe(false);
  });

  it("summarizes products for the product management dashboard", () => {
    const summary = getProductSummary([
      product({ id: "active", costPrice: "10", balances: [{ quantity: 10 }] }),
      product({ id: "low", minStock: 5, balances: [{ quantity: 3 }] }),
      product({ id: "out", balances: [{ quantity: 0 }] }),
      product({ id: "archived", status: "ARCHIVED", balances: [{ quantity: 99 }] })
    ]);

    expect(summary).toEqual({
      totalManaged: 3,
      active: 3,
      lowStock: 1,
      outOfStock: 1,
      stockValue: 130
    });
  });

  it("matches product search across name, sku, barcode, category, and brand", () => {
    const row = product({
      name: "น้ำดื่ม 600ml",
      sku: "DRINK-001",
      barcode: "8851234567890",
      category: { name: "เครื่องดื่ม" },
      brand: { name: "Zentory" }
    });

    expect(matchesProductSearch(row, "น้ำดื่ม")).toBe(true);
    expect(matchesProductSearch(row, "drink")).toBe(true);
    expect(matchesProductSearch(row, "67890")).toBe(true);
    expect(matchesProductSearch(row, "เครื่อง")).toBe(true);
    expect(matchesProductSearch(row, "zentory")).toBe(true);
    expect(matchesProductSearch(row, "สบู่")).toBe(false);
  });
  it("resolves product image paths from the API origin", () => {
    expect(getProductImageUrl({ imagePath: "/uploads/products/photo.webp" })).toBe("http://localhost:4000/uploads/products/photo.webp");
    expect(getProductImageUrl({ imagePath: "https://cdn.example.com/photo.webp" })).toBe("https://cdn.example.com/photo.webp");
    expect(getProductImageUrl({ imagePath: null })).toBeUndefined();
  });

  it("validates product image files before upload", () => {
    const image = new File(["image"], "photo.png", { type: "image/png" });
    expect(validateProductImageFile(image)).toBeUndefined();

    const gif = new File(["image"], "photo.gif", { type: "image/gif" });
    expect(validateProductImageFile(gif)).toBe("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP");

    const tooLarge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "photo.webp", { type: "image/webp" });
    expect(validateProductImageFile(tooLarge)).toBe("ขนาดรูปสินค้าต้องไม่เกิน 5MB");
  });
});
