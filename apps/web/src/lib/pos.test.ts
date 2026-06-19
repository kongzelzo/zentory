import { describe, expect, it } from "vitest";
import { buildSalePayload, canAddToCart, findExactScannedProduct, getCartLineStockState, getCheckoutIssue, getPreferredWarehouseId, getSaleTotals, sanitizeCartQuantity, stockOf, type PosProduct } from "./pos";

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

  it("counts and validates stock for the selected warehouse only", () => {
    const item = product({
      balances: [
        { warehouseId: "front", quantity: 2 },
        { warehouseId: "back", quantity: 8 }
      ]
    });

    expect(stockOf(item)).toBe(10);
    expect(stockOf(item, "front")).toBe(2);
    expect(stockOf(item, "missing")).toBe(0);
    expect(canAddToCart(item, 2, "front")).toEqual({ ok: false, reason: "stock-limit" });
    expect(canAddToCart(item, 2, "back")).toEqual({ ok: true });
  });

  it("keeps legacy single-balance demo products sellable when a warehouse is selected", () => {
    expect(stockOf(product({ balances: [{ quantity: 5 }] }), "front")).toBe(5);
  });

  it("keeps the current active warehouse or picks the storefront before the default active warehouse", () => {
    const warehouses = [
      { id: "inactive-default", status: "INACTIVE", isDefault: true },
      { id: "main", status: "ACTIVE", isDefault: true },
      { id: "front", type: "STORE_FRONT" as const, status: "ACTIVE" },
      { id: "back", type: "BRANCH_WAREHOUSE" as const, status: "ACTIVE" }
    ];

    expect(getPreferredWarehouseId(warehouses, "back")).toBe("back");
    expect(getPreferredWarehouseId(warehouses, "missing")).toBe("front");
    expect(getPreferredWarehouseId(warehouses.filter((warehouse) => warehouse.id !== "front"), "missing")).toBe("main");
    expect(getPreferredWarehouseId([{ id: "closed", status: "INACTIVE", isDefault: true }])).toBe("");
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

  it("validates checkout against the selected warehouse stock", () => {
    const cart = [{
      ...product({
        balances: [
          { warehouseId: "front", quantity: 1 },
          { warehouseId: "back", quantity: 5 }
        ]
      }),
      quantity: 2
    }];

    expect(getCheckoutIssue(cart, "front")).toBe("stock-exceeded");
    expect(getCheckoutIssue(cart, "back")).toBeUndefined();
  });

  it("builds a sale payload with the selected warehouse", () => {
    const cart = [{ ...product(), quantity: 2 }];

    expect(buildSalePayload(cart, "branch-1", "warehouse-1", 5, "CASH")).toEqual({
      branchId: "branch-1",
      warehouseId: "warehouse-1",
      discount: 5,
      paymentMethod: "CASH",
      items: [{ productId: "product-1", quantity: 2 }]
    });
  });

  it("allows cart quantity keyboard edits to clear to zero before checkout validation", () => {
    expect(sanitizeCartQuantity("", 8)).toBe(0);
    expect(sanitizeCartQuantity(0, 8)).toBe(0);
    expect(sanitizeCartQuantity(12, 8)).toBe(8);
    expect(sanitizeCartQuantity(2.9, 8)).toBe(2);
    expect(sanitizeCartQuantity(-3, 8)).toBe(0);
  });
});
