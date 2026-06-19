import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDemo } from "./local-demo";

const demoKey = "zentory.local-demo.v1";
const storeBranchId = "local_store_branch_main";
const warehouseId = "local_branch_main";

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  });
}

function seedDemoState() {
  localStorage.setItem(demoKey, JSON.stringify({
    branches: [{ id: warehouseId, name: "หน้าร้านหลัก", code: "MAIN", status: "ACTIVE", isDefault: true, createdAt: "2026-06-16T00:00:00.000Z" }],
    categories: [{ id: "category-1", name: "เครื่องดื่ม", color: "#2563eb", createdAt: "2026-06-16T00:00:00.000Z" }],
    products: [{
      id: "product-1",
      sku: "DRINK-001",
      name: "น้ำดื่ม",
      unit: "ชิ้น",
      costPrice: "8",
      salePrice: "12",
      minStock: 5,
      status: "ACTIVE",
      category: { name: "เครื่องดื่ม" },
      balances: [{ warehouseId, quantity: 10 }]
    }, {
      id: "product-empty",
      sku: "EMPTY-001",
      name: "สินค้ายังไม่มีสต็อก",
      unit: "ชิ้น",
      costPrice: "5",
      salePrice: "9",
      minStock: 2,
      status: "ACTIVE",
      category: { name: "เครื่องดื่ม" },
      balances: []
    }],
    sales: [],
    movements: [],
    members: []
  }));
}

describe("local demo branch scope", () => {
  beforeEach(() => {
    stubLocalStorage();
    seedDemoState();
  });

  it("keeps product master rows visible when branch scope is selected", async () => {
    const allProducts = await localDemo<Array<{ id: string }>>("/products");
    const scopedProducts = await localDemo<Array<{ id: string }>>(`/products?branchId=${storeBranchId}`);
    const invalidScopedProducts = await localDemo<Array<{ id: string }>>("/products?branchId=missing");
    const stockRows = await localDemo<Array<{ productId: string }>>(`/reports/stock?warehouseId=${warehouseId}`);
    const invalidStockRows = await localDemo<Array<{ productId: string }>>("/reports/stock?warehouseId=missing");

    expect(allProducts.map((product) => product.id)).toEqual(["product-1", "product-empty"]);
    expect(scopedProducts.map((product) => product.id)).toEqual(["product-1", "product-empty"]);
    expect(invalidScopedProducts).toEqual([]);
    expect(stockRows.map((row) => row.productId)).toEqual(["product-1", "product-empty"]);
    expect(invalidStockRows).toEqual([]);
  });

  it("uses branch scope through warehouse balances for category rows", async () => {
    const categories = await localDemo<Array<{ id: string; _count: { products: number }; products: Array<{ id: string; balances: Array<{ quantity: number }> }> }>>(`/categories?branchId=${storeBranchId}`);

    expect(categories).toHaveLength(1);
    expect(categories[0]._count.products).toBe(2);
    expect(categories[0].products).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "product-empty", balances: [] }),
      expect.objectContaining({ id: "product-1", balances: [{ quantity: 10 }] })
    ]));
  });

  it("filters local demo staff members by selected branch", async () => {
    localStorage.setItem(demoKey, JSON.stringify({
      branches: [
        { id: "branch_one", name: "สาขาหนึ่ง", code: "ONE", status: "ACTIVE", isDefault: true, createdAt: "2026-06-16T00:00:00.000Z" },
        { id: "branch_two", name: "สาขาสอง", code: "TWO", status: "ACTIVE", isDefault: false, createdAt: "2026-06-16T00:00:00.000Z" }
      ],
      categories: [],
      products: [],
      sales: [],
      movements: [],
      members: [
        { id: "owner", role: "OWNER", status: "ACTIVE", permissionOverrides: {}, assignedBranchIds: [], user: { id: "owner_user", name: "Owner", email: "owner@example.com" } },
        { id: "staff_one", role: "CASHIER", status: "ACTIVE", permissionOverrides: {}, assignedBranchIds: ["branch_one"], user: { id: "user_one", name: "One", email: "one@example.com" } },
        { id: "staff_two", role: "CASHIER", status: "ACTIVE", permissionOverrides: {}, assignedBranchIds: ["branch_two"], user: { id: "user_two", name: "Two", email: "two@example.com" } },
        { id: "pending_one", role: "VIEWER", status: "PENDING", preferredBranch: "ONE", permissionOverrides: {}, assignedBranchIds: [], user: { id: "pending_user", name: "Pending", email: "pending@example.com" } }
      ]
    }));

    const branchOneMembers = await localDemo<Array<{ id: string }>>("/members?branchId=branch_one");

    expect(branchOneMembers.map((member) => member.id)).toEqual(["staff_one", "pending_one"]);
  });

  it("preserves warehouse ids on local stock writes so scoped filters keep working", async () => {
    await localDemo("/inventory/receipts", {
      method: "POST",
      body: JSON.stringify({ warehouseId, items: [{ productId: "product-1", quantity: 2 }] })
    });

    const products = await localDemo<Array<{ balances: Array<{ warehouseId?: string; quantity: number }> }>>(`/products?branchId=${storeBranchId}`);

    expect(products[0].balances[0]).toEqual({ warehouseId, quantity: 12 });
  });

  it("shows product master rows as empty stock on warehouse detail", async () => {
    const warehouse = await localDemo<{ balances: Array<{ productId: string; warehouseId: string; quantity: number }> }>(`/warehouses/${warehouseId}`);

    expect(warehouse.balances).toEqual([
      expect.objectContaining({ productId: "product-1", warehouseId, quantity: 10 }),
      expect.objectContaining({ productId: "product-empty", warehouseId, quantity: 0 })
    ]);
  });

  it("returns transfer warehouse options with their own branch labels", async () => {
    localStorage.setItem(demoKey, JSON.stringify({
      branches: [
        { id: warehouseId, name: "หน้าร้านหลัก", code: "MAIN", status: "ACTIVE", isDefault: true, createdAt: "2026-06-16T00:00:00.000Z" },
        { id: "moon_wh", name: "สาขาดวงจันทร์", code: "MOON", status: "ACTIVE", isDefault: false, createdAt: "2026-06-16T00:00:00.000Z" }
      ],
      categories: [],
      products: [],
      sales: [],
      movements: [],
      members: []
    }));

    const warehouses = await localDemo<Array<{ id: string; branch: { id: string; name: string } }>>("/warehouses?scope=business");

    expect(warehouses.map((warehouse) => [warehouse.id, warehouse.branch.name])).toEqual([
      [warehouseId, "สาขาหลัก"],
      ["moon_wh", "สาขาดวงจันทร์"]
    ]);
  });

  it("runs a local stock count through review and apply", async () => {
    const count = await localDemo<{ id: string; items: Array<{ productId: string; systemQuantity: number }>; summary: { totalItems: number } }>("/inventory/stock-counts", {
      method: "POST",
      body: JSON.stringify({ warehouseId, note: "ตรวจรอบเช้า" })
    });

    expect(count.summary.totalItems).toBe(1);
    expect(count.items[0]).toEqual(expect.objectContaining({ productId: "product-1", systemQuantity: 10 }));

    await localDemo(`/inventory/stock-counts/${count.id}/items`, {
      method: "PATCH",
      body: JSON.stringify({ items: [{ productId: "product-1", countedQuantity: 8, note: "เจอขาด" }] })
    });
    const review = await localDemo<{ status: string; summary: { differentItems: number; decreaseQuantity: number } }>(`/inventory/stock-counts/${count.id}/review`, { method: "PATCH" });

    expect(review.status).toBe("REVIEW");
    expect(review.summary).toEqual(expect.objectContaining({ differentItems: 1, decreaseQuantity: 2 }));

    const applied = await localDemo<{ status: string }>(`/inventory/stock-counts/${count.id}/apply`, { method: "POST" });
    const products = await localDemo<Array<{ id: string; balances: Array<{ warehouseId?: string; quantity: number }> }>>(`/products?branchId=${storeBranchId}`);
    const movements = await localDemo<Array<{ type: string; quantity: number; targetQuantity?: number; reason?: string }>>("/inventory/movements");

    expect(applied.status).toBe("APPLIED");
    expect(products.find((product) => product.id === "product-1")?.balances[0]).toEqual({ warehouseId, quantity: 8 });
    expect(movements[0]).toEqual(expect.objectContaining({ type: "ADJUSTMENT_OUT", quantity: 2, targetQuantity: 8 }));
    expect(movements[0].reason).toContain("นับสต็อก");
  });
});
