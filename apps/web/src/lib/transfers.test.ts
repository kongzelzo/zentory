import { describe, expect, it } from "vitest";
import { buildTransferPayload, getTransferFormIssue, stockAtWarehouse, type TransferProductOption } from "./transfers";

const products: TransferProductOption[] = [
  { id: "water", name: "น้ำดื่ม", sku: "WATER", balances: [{ warehouseId: "source", quantity: 5 }] },
  { id: "snack", name: "ขนม", sku: "SNACK", balances: [{ warehouseId: "source", quantity: 1 }] }
];

describe("transfer helpers", () => {
  it("builds a multi-item transfer payload", () => {
    expect(buildTransferPayload({
      sourceWarehouseId: "source",
      destinationWarehouseId: "dest",
      note: " ส่งไปสาขาใหม่ ",
      rows: [
        { id: "1", productId: "water", quantity: 2 },
        { id: "2", productId: "snack", quantity: 1 }
      ]
    })).toEqual({
      sourceWarehouseId: "source",
      destinationWarehouseId: "dest",
      note: "ส่งไปสาขาใหม่",
      items: [
        { productId: "water", quantity: 2 },
        { productId: "snack", quantity: 1 }
      ]
    });
  });

  it("checks stock at the source warehouse", () => {
    expect(stockAtWarehouse(products[0], "source")).toBe(5);
    expect(stockAtWarehouse(products[0], "dest")).toBe(0);
  });

  it("validates transfer locations and available stock", () => {
    expect(getTransferFormIssue({ sourceWarehouseId: "source", destinationWarehouseId: "source", rows: [{ id: "1", productId: "water", quantity: 1 }], products })).toBe("ต้นทางและปลายทางต้องเป็นคนละคลัง");
    expect(getTransferFormIssue({ sourceWarehouseId: "source", destinationWarehouseId: "dest", rows: [{ id: "1", productId: "water", quantity: 6 }], products })).toBe("จำนวนโอนมากกว่าสต็อกต้นทาง");
    expect(getTransferFormIssue({ sourceWarehouseId: "source", destinationWarehouseId: "dest", rows: [{ id: "1", productId: "water", quantity: 5 }], products })).toBeUndefined();
  });
});
