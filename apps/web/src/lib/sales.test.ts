import { describe, expect, it } from "vitest";
import { getPaymentMethodLabel, getReceiptSummary, type SaleForReceipt } from "./sales";

const sale: SaleForReceipt = {
  id: "sale-1",
  receiptNo: "SALE-001",
  total: "42",
  subtotal: "50",
  discount: "8",
  paymentMethod: "TRANSFER",
  createdAt: "2026-06-13T05:00:00.000Z",
  items: [
    { quantity: 2, unitPrice: "10", total: "20", product: { name: "Water" } },
    { quantity: 1, unitPrice: "30", total: "30", product: { name: "Snack" } }
  ]
};

describe("sales helpers", () => {
  it("summarizes receipt totals from explicit sale values", () => {
    expect(getReceiptSummary(sale)).toEqual({
      subtotal: 50,
      discount: 8,
      total: 42,
      itemCount: 2,
      unitCount: 3
    });
  });

  it("falls back to item totals when subtotal or discount is missing", () => {
    expect(getReceiptSummary({ ...sale, subtotal: undefined, discount: undefined, total: "50" })).toEqual({
      subtotal: 50,
      discount: 0,
      total: 50,
      itemCount: 2,
      unitCount: 3
    });
  });

  it("labels supported payment methods for receipts", () => {
    expect(getPaymentMethodLabel("CASH")).toBe("เงินสด");
    expect(getPaymentMethodLabel("TRANSFER")).toBe("โอนเงิน");
    expect(getPaymentMethodLabel(undefined)).toBe("เงินสด");
  });
});
