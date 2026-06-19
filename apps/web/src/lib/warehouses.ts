export type WarehouseForSelection = {
  id: string;
  name?: string;
  code?: string;
  type?: "MAIN_WAREHOUSE" | "STORE_FRONT" | "BRANCH_WAREHOUSE" | "SECONDARY_WAREHOUSE";
  status?: string;
  isDefault?: boolean;
};

export function getActiveWarehouses<TWarehouse extends WarehouseForSelection>(warehouses: TWarehouse[] = []) {
  return warehouses.filter((warehouse) => (warehouse.status ?? "ACTIVE") === "ACTIVE");
}

export function getPreferredWarehouse<TWarehouse extends WarehouseForSelection>(warehouses: TWarehouse[] = [], currentWarehouseId = "") {
  const activeWarehouses = getActiveWarehouses(warehouses);
  return activeWarehouses.find((warehouse) => warehouse.id === currentWarehouseId)
    ?? activeWarehouses.find((warehouse) => warehouse.type === "STORE_FRONT")
    ?? activeWarehouses.find((warehouse) => warehouse.isDefault)
    ?? activeWarehouses[0];
}

export function getPreferredWarehouseId(warehouses: WarehouseForSelection[] = [], currentWarehouseId = "") {
  return getPreferredWarehouse(warehouses, currentWarehouseId)?.id ?? "";
}

export function getSingleActiveWarehouse<TWarehouse extends WarehouseForSelection>(warehouses: TWarehouse[] = []) {
  const activeWarehouses = getActiveWarehouses(warehouses);
  return activeWarehouses.length === 1 ? activeWarehouses[0] : undefined;
}

export function shouldShowWarehouseSelector(warehouses: WarehouseForSelection[] = []) {
  return getActiveWarehouses(warehouses).length > 1;
}

export function warehouseDisplayName(warehouse?: WarehouseForSelection) {
  if (!warehouse) return "ยังไม่ได้เลือกคลัง";
  return warehouse.code ? `${warehouse.name ?? "คลัง"} (${warehouse.code})` : warehouse.name ?? "คลัง";
}
