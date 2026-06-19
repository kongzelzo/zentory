import { describe, expect, it } from "vitest";
import { allLocations, buildTransferHref, stockedLocations, totalStock, type StockSearchProduct } from "./stock-search";

const product: StockSearchProduct = {
  id: "product-1",
  name: "น้ำดื่ม",
  sku: "WATER-001",
  unit: "แพ็ก",
  costPrice: "40",
  salePrice: "55",
  minStock: 3,
  status: "ACTIVE",
  balances: [
    { warehouseId: "front", quantity: 0, warehouse: { id: "front", name: "หน้าร้าน", branch: { id: "main", name: "สาขาหลัก" } } },
    { warehouseId: "back", quantity: 8, warehouse: { id: "back", name: "คลังหลังร้าน", branch: { id: "main", name: "สาขาหลัก" } } },
    { warehouseId: "second", quantity: 2, warehouse: { id: "second", name: "คลังสำรอง", branch: { id: "main", name: "สาขาหลัก" } } }
  ]
};

describe("stock-search helpers", () => {
  it("summarizes stock across warehouses", () => {
    expect(totalStock(product)).toBe(10);
  });

  it("returns stocked locations before empty locations", () => {
    expect(stockedLocations(product).map((balance) => balance.warehouseId)).toEqual(["back", "second"]);
    expect(allLocations(product).map((balance) => balance.warehouseId)).toEqual(["back", "second", "front"]);
  });

  it("builds the transfer handoff URL", () => {
    expect(buildTransferHref("product-1", "back")).toBe("/app/transfers?productId=product-1&sourceWarehouseId=back");
    expect(buildTransferHref("product-1", "back", "front")).toBe("/app/transfers?productId=product-1&sourceWarehouseId=back&destinationWarehouseId=front");
    expect(buildTransferHref("product-1")).toBe("/app/transfers?productId=product-1");
  });
});
