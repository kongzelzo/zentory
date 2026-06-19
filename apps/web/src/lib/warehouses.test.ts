import { describe, expect, it } from "vitest";
import { getActiveWarehouses, getPreferredWarehouseId, getSingleActiveWarehouse, shouldShowWarehouseSelector, warehouseDisplayName } from "./warehouses";

describe("warehouse selection helpers", () => {
  const warehouses = [
    { id: "closed", name: "คลังปิด", code: "OLD", status: "INACTIVE", isDefault: true },
    { id: "main", name: "คลังหลัก", code: "MAIN", status: "ACTIVE", isDefault: true },
    { id: "front", name: "หน้าร้าน", code: "FRONT", type: "STORE_FRONT" as const, status: "ACTIVE" },
    { id: "back", name: "หลังร้าน", code: "BACK", type: "BRANCH_WAREHOUSE" as const, status: "ACTIVE" }
  ];

  it("filters active warehouses and prefers current/storefront/default active warehouses", () => {
    expect(getActiveWarehouses(warehouses).map((warehouse) => warehouse.id)).toEqual(["main", "front", "back"]);
    expect(getPreferredWarehouseId(warehouses, "back")).toBe("back");
    expect(getPreferredWarehouseId(warehouses, "missing")).toBe("front");
    expect(getPreferredWarehouseId(warehouses.filter((warehouse) => warehouse.id !== "front"), "missing")).toBe("main");
  });

  it("detects whether users need to choose a warehouse", () => {
    expect(getSingleActiveWarehouse([warehouses[1]])?.id).toBe("main");
    expect(shouldShowWarehouseSelector([warehouses[1]])).toBe(false);
    expect(getSingleActiveWarehouse(warehouses)).toBeUndefined();
    expect(shouldShowWarehouseSelector(warehouses)).toBe(true);
  });

  it("formats warehouse labels consistently", () => {
    expect(warehouseDisplayName(warehouses[1])).toBe("คลังหลัก (MAIN)");
    expect(warehouseDisplayName({ id: "no-code", name: "คลังสำรอง" })).toBe("คลังสำรอง");
  });
});
