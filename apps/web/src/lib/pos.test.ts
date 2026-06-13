import { describe, expect, it } from "vitest";
import { canAddToCart, findExactScannedProduct, getCartLineStockState, getCheckoutIssue, getSaleTotals, sanitizeCartQuantity, type PosProduct } from "./pos";

function product(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: "product-1",
    name: "Water",
    sku: "DRINK-001",
    barcode: "885000000001",
    salePrice: "10",
    balances: [{ quantity: 5 }],
    ...overrides
  };
}

describe("POS helpers", () => {
  it("finds an exact scanned product by barcode or sku", () => {
    const products = [product(), product({ id: "product-2", sku: "SNACK-001", barcode: "885000000002" })];

    expect(findExactScannedProduct(products, "885000000002")?.id).toBe("product-2");
    expect(findExactScannedProduct(products, " drink-001 ")?.id).toBe("product-1");
    expect(findExactScannedProduct(products, "DRINK")?.id).toBeUndefined();
  });

  it("prevents adding more units than available stock", () => {
    expect(canAddToCart(product({ balances: [{ quantity: 2 }] }), 1)).toEqual({ ok: true });
    expect(canAddToCart(product({ balances: [{ quantity: 2 }] }), 2)).toEqual({
      ok: false,
      reason: "stock-limit"
    });
    expect(canAddToCart(product({ balances: [{ quantity: 0 }] }), 0)).toEqual({
      ok: false,
      reason: "out-of-stock"
    });
  });

  it("reports cart line stock state for launch-safe POS messaging", () => {
    expect(getCartLineStockState(product({ balances: [{ quantity: 0 }] }), 1)).toBe("over");
    expect(getCartLineStockState(product({ balances: [{ quantity: 2 }] }), 2)).toBe("maxed");
    expect(getCartLineStockState(product({ balances: [{ quantity: 3 }] }), 2)).toBe("available");
  });

  it("validates checkout and clamps discounts into a non-negative total", () => {
    const cart = [{ ...product({ salePrice: "25", balances: [{ quantity: 3 }] }), quantity: 2 }];

    expect(getCheckoutIssue([])).toBe("empty-cart");
    expect(getCheckoutIssue([{ ...product({ balances: [{ quantity: 1 }] }), quantity: 2 }])).toBe("stock-exceeded");
    expect(getCheckoutIssue(cart)).toBeUndefined();
    expect(getSaleTotals(cart, 80)).toEqual({ subtotal: 50, discount: 80, total: 0 });
  });

  it("allows cart quantity keyboard edits to clear to zero before checkout validation", () => {
    expect(sanitizeCartQuantity("", 8)).toBe(0);
    expect(sanitizeCartQuantity(0, 8)).toBe(0);
    expect(sanitizeCartQuantity(12, 8)).toBe(8);
    expect(sanitizeCartQuantity(2.9, 8)).toBe(2);
    expect(sanitizeCartQuantity(-3, 8)).toBe(0);
  });
});
