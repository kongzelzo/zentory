import { describe, expect, it } from "vitest";
import { getRestockHref, getStockAlertHref, getStockAlertPreview, getStockAlertStatus, getStockAlertSummary } from "./stock-alerts";

const rows = [
  { productId: "ok-1", sku: "OK-001", name: "พร้อมขาย", quantity: 20, minStock: 5, status: "OK" as const },
  { productId: "low-1", sku: "LOW-001", name: "น้ำดื่ม 600ml", quantity: 3, minStock: 12, status: "LOW" as const },
  { productId: "out-1", sku: "OUT-001", name: "ขนมถุงเล็ก", quantity: 0, minStock: 10, status: "OUT" as const },
  { productId: "low-2", sku: "LOW-002", name: "ถ่าน AA", quantity: 2, minStock: 6, status: "LOW" as const }
];

describe("stock alert helpers", () => {
  it("builds a preview from active stock alerts with OUT items first", () => {
    expect(getStockAlertPreview(rows, 2)).toEqual({
      alerts: [rows[2], rows[1]],
      lowCount: 2,
      outCount: 1,
      total: 3
    });
  });

  it("does not report alerts when every stock row is OK", () => {
    expect(getStockAlertPreview([rows[0]])).toEqual({
      alerts: [],
      lowCount: 0,
      outCount: 0,
      total: 0
    });
  });

  it("links a stock alert to its product detail page", () => {
    expect(getStockAlertHref(rows[1])).toBe("/app/products/low-1");
  });

  it("summarizes active alerts by severity", () => {
    expect(getStockAlertSummary(rows)).toEqual({
      alerts: [rows[2], rows[1], rows[3]],
      lowCount: 2,
      outCount: 1,
      total: 3
    });
  });

  it("derives severity defensively from quantity and threshold", () => {
    expect(getStockAlertStatus({ ...rows[0], quantity: 0, minStock: 5, status: "OK" })).toBe("OUT");
    expect(getStockAlertStatus({ ...rows[0], quantity: 3, minStock: 5, status: "OK" })).toBe("LOW");
    expect(getStockAlertStatus({ ...rows[0], quantity: 8, minStock: 5, status: "LOW" })).toBe("OK");
  });

  it("does not build navigation hrefs when product id is missing", () => {
    const row = { ...rows[1], productId: "" };

    expect(getStockAlertHref(row)).toBeUndefined();
    expect(getRestockHref(row)).toBeUndefined();
  });

  it("links a stock alert to the receipt flow with a product query", () => {
    expect(getRestockHref(rows[1])).toBe("/app/inventory/receipts?productId=low-1");
  });
});
