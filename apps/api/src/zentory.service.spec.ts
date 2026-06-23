import { ZentoryService } from "./zentory.service";
import { ProductImageStorageService } from "./products/product-image-storage.service";

const user = { userId: "user_1", businessId: "business_1", role: "OWNER", email: "owner@example.com", isSystemAdmin: false };

describe("ZentoryService Phase 1 inventory behavior", () => {
  it("creates a product variant group with per-variant stock movements", async () => {
    const createdProducts: any[] = [];
    const tx: any = {
      category: { upsert: jest.fn().mockResolvedValue({ id: "category_1" }) },
      brand: { upsert: jest.fn().mockResolvedValue({ id: "brand_1" }) },
      productGroup: {
        create: jest.fn().mockResolvedValue({ id: "group_1" }),
        findFirstOrThrow: jest.fn().mockImplementation(async () => ({ id: "group_1", name: "เสื้อ Oversize A", products: createdProducts }))
      },
      stockReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt_1", documentNo: "REC-TEST" }) },
      product: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const product = { id: `product_${createdProducts.length + 1}`, ...data };
          createdProducts.push(product);
          return product;
        }),
        findFirst: jest.fn().mockResolvedValue({ id: "product_ok", status: "ACTIVE" })
      },
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 0 }),
        upsert: jest.fn().mockImplementation(async ({ create, update }) => ({ ...create, quantity: update?.quantity?.increment ?? create.quantity }))
      },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: "movement_1" }) }
    };
    const prisma: any = {
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      product: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1", status: "ACTIVE" } })
      },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const notifications = { refreshStockAlertsForProducts: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new ZentoryService(prisma, undefined as any, notifications);

    await expect(service.createProductVariants(user, {
      name: "เสื้อ Oversize A",
      skuPrefix: "TSHIRT-A",
      warehouseId: "warehouse_1",
      colors: ["ดำ"],
      sizes: ["M", "L"],
      categoryName: "เสื้อผ้า",
      brandName: "Zentory",
      unit: "ตัว",
      costPrice: 100,
      salePrice: 250,
      minStock: 2,
      variants: [
        { color: "ดำ", size: "M", sku: "TSHIRT-A-BLK-M", costPrice: 100, salePrice: 250, minStock: 2, receiveQuantity: 3, receiveUnitCost: 95 },
        { color: "ดำ", size: "L", sku: "TSHIRT-A-BLK-L", costPrice: 110, salePrice: 260, minStock: 1, receiveQuantity: 0, receiveUnitCost: 110 }
      ]
    })).resolves.toMatchObject({ id: "group_1", products: expect.arrayContaining([expect.objectContaining({ variantColor: "ดำ", variantSize: "M" })]) });

    expect(tx.productGroup.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "เสื้อ Oversize A", skuPrefix: "TSHIRT-A" })
    }));
    expect(tx.product.create).toHaveBeenCalledTimes(2);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ productId: "product_1", quantity: 3, unitCost: 95, reference: "REC-TEST" })
    }));
    expect(notifications.refreshStockAlertsForProducts).toHaveBeenCalledWith("business_1", ["product_1", "product_2"], ["branch_1"]);
  });

  it("rejects duplicate SKUs before creating product variants", async () => {
    const prisma: any = {
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      warehouse: { findFirst: jest.fn() },
      $transaction: jest.fn()
    };
    const service = new ZentoryService(prisma);

    await expect(service.createProductVariants(user, {
      name: "เสื้อ Oversize A",
      skuPrefix: "TSHIRT-A",
      warehouseId: "warehouse_1",
      colors: ["ดำ"],
      sizes: ["M", "L"],
      costPrice: 100,
      salePrice: 250,
      minStock: 2,
      variants: [
        { color: "ดำ", size: "M", sku: "DUP", receiveQuantity: 0 },
        { color: "ดำ", size: "L", sku: "DUP", receiveQuantity: 0 }
      ]
    })).rejects.toThrow("มี SKU ซ้ำในรายการ variant");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates color-only product variants without saving a placeholder size", async () => {
    const createdProducts: any[] = [];
    const tx: any = {
      productGroup: {
        create: jest.fn().mockResolvedValue({ id: "group_1" }),
        findFirstOrThrow: jest.fn().mockImplementation(async () => ({ id: "group_1", name: "ขันตักน้ำ", products: createdProducts }))
      },
      product: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const product = { id: `product_${createdProducts.length + 1}`, ...data };
          createdProducts.push(product);
          return product;
        })
      },
      inventoryBalance: { upsert: jest.fn().mockResolvedValue({ quantity: 0 }) },
      stockReceipt: { create: jest.fn() },
      stockMovement: { create: jest.fn() }
    };
    const prisma: any = {
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      product: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1", status: "ACTIVE" } })
      },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const notifications = { refreshStockAlertsForProducts: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new ZentoryService(prisma, undefined as any, notifications);

    await expect(service.createProductVariants(user, {
      name: "ขันตักน้ำ",
      skuPrefix: "SCOOP",
      warehouseId: "warehouse_1",
      colors: ["แดง", "น้ำเงิน"],
      sizes: [],
      unit: "ใบ",
      costPrice: 12,
      salePrice: 25,
      minStock: 5,
      variants: [
        { color: "แดง", sku: "SCOOP-RED", receiveQuantity: 0 },
        { color: "น้ำเงิน", sku: "SCOOP-BLUE", receiveQuantity: 0 }
      ]
    })).resolves.toMatchObject({
      products: expect.arrayContaining([
        expect.objectContaining({ sku: "SCOOP-RED", variantColor: "แดง", variantSize: null }),
        expect.objectContaining({ sku: "SCOOP-BLUE", variantColor: "น้ำเงิน", variantSize: null })
      ])
    });

    expect(tx.product.create).toHaveBeenCalledTimes(2);
    expect(tx.stockReceipt.create).not.toHaveBeenCalled();
  });

  it("creates warehouses with warehouse metadata", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_main", status: "ACTIVE" })
      },
      businessSubscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { name: "Professional", warehouseLimit: 3 } })
      },
      warehouse: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({
          id: "warehouse_2",
          branchId: "branch_main",
          name: "Warehouse Bangkok",
          code: "WH-BKK",
          type: "SECONDARY_WAREHOUSE",
          status: "ACTIVE",
          address: "Zone A",
          contactName: "Somchai",
          contactPhone: "0800000000",
          note: "Cold room"
        })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createWarehouse(user, {
      name: "Warehouse Bangkok",
      code: "wh-bkk",
      branchId: "branch_main",
      type: "SECONDARY_WAREHOUSE",
      status: "ACTIVE",
      address: "Zone A",
      contactName: "Somchai",
      contactPhone: "0800000000",
      note: "Cold room"
    })).resolves.toEqual(expect.objectContaining({ code: "WH-BKK", type: "SECONDARY_WAREHOUSE", note: "Cold room" }));

    expect(prisma.warehouse.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "business_1",
        branchId: "branch_main",
        name: "Warehouse Bangkok",
        code: "WH-BKK",
        type: "SECONDARY_WAREHOUSE",
        status: "ACTIVE",
        address: "Zone A",
        contactName: "Somchai",
        contactPhone: "0800000000",
        note: "Cold room"
      })
    }));
  });

  it("blocks creating warehouses when the plan warehouse limit is full", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn()
      },
      businessSubscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { name: "Professional", warehouseLimit: 3 } })
      },
      warehouse: {
        count: jest.fn().mockResolvedValue(3),
        create: jest.fn()
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createWarehouse(user, {
      name: "Overflow Warehouse",
      code: "wh-overflow",
      branchId: "branch_main"
    })).rejects.toThrow("แพ็กเกจ Professional เพิ่มคลังได้สูงสุด 3 คลัง");

    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
    expect(prisma.warehouse.create).not.toHaveBeenCalled();
  });

  it("updates warehouse metadata and rejects duplicate warehouse codes", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_main", status: "ACTIVE" })
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_2", businessId: "business_1", branchId: "branch_main", name: "Old", code: "OLD", status: "ACTIVE", isDefault: false }),
        update: jest.fn()
          .mockResolvedValueOnce({ id: "warehouse_2", name: "New", code: "STORE-01" })
          .mockRejectedValueOnce({ code: "P2002", meta: { target: ["businessId", "code"] } })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateWarehouse(user, "warehouse_2", {
      name: "New",
      code: "store-01",
      branchId: "branch_main",
      type: "STORE_FRONT",
      status: "ACTIVE",
      address: "Front",
      contactName: "Owner",
      contactPhone: "0811111111",
      note: "Main counter"
    })).resolves.toEqual(expect.objectContaining({ code: "STORE-01" }));

    expect(prisma.warehouse.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: "STORE-01", type: "STORE_FRONT", address: "Front" })
    }));

    await expect(service.updateWarehouse(user, "warehouse_2", { code: "MAIN" })).rejects.toThrow("รหัสคลังนี้ถูกใช้แล้ว");
  });

  it("filters transfer actions by the requested branch side", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_main", businessId: "business_1", status: "ACTIVE" })
      },
      stockTransfer: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new ZentoryService(prisma);

    await service.listTransfers(user, { status: "IN_TRANSIT", branchId: "branch_main", side: "destination" });

    expect(prisma.stockTransfer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1",
        status: "IN_TRANSIT",
        destinationWarehouse: { branchId: "branch_main" }
      })
    }));
    expect(prisma.stockTransfer.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it("blocks disabling the default warehouse when it has stock or is the last active warehouse", async () => {
    const prismaWithStock: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", businessId: "business_1", branchId: "branch_1", name: "Main", code: "MAIN", status: "ACTIVE", isDefault: true }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn()
      },
      inventoryBalance: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 3 } })
      }
    };
    const serviceWithStock = new ZentoryService(prismaWithStock);

    await expect(serviceWithStock.updateWarehouse(user, "warehouse_1", { status: "INACTIVE" })).rejects.toThrow("ไม่สามารถปิดใช้งานคลังหลักที่ยังมีสต็อกอยู่");
    expect(prismaWithStock.warehouse.update).not.toHaveBeenCalled();

    const prismaLastActive: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", businessId: "business_1", branchId: "branch_1", name: "Main", code: "MAIN", status: "ACTIVE", isDefault: true }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn()
      },
      inventoryBalance: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } })
      }
    };
    const serviceLastActive = new ZentoryService(prismaLastActive);

    await expect(serviceLastActive.updateWarehouse(user, "warehouse_1", { status: "INACTIVE" })).rejects.toThrow("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลังในสาขานี้");
    expect(prismaLastActive.warehouse.update).not.toHaveBeenCalled();
  });

  it("blocks disabling the last active warehouse in its branch even when another branch has active warehouses", async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_moon", businessId: "business_1", branchId: "branch_moon", status: "ACTIVE", isDefault: false }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn()
      },
      inventoryBalance: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } })
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_moon", businessId: "business_1", status: "ACTIVE" })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateWarehouse(user, "warehouse_moon", { status: "INACTIVE" })).rejects.toThrow("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลังในสาขานี้");

    expect(prisma.warehouse.count).toHaveBeenCalledWith({
      where: {
        businessId: "business_1",
        branchId: "branch_moon",
        status: "ACTIVE",
        id: { not: "warehouse_moon" }
      }
    });
    expect(prisma.warehouse.update).not.toHaveBeenCalled();
  });

  it("deletes an unused non-default warehouse", async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "warehouse_2",
          businessId: "business_1",
          branchId: "branch_1",
          status: "INACTIVE",
          isDefault: false,
          _count: { balances: 0, movements: 0, receipts: 0, adjustments: 0, sales: 0 }
        }),
        count: jest.fn().mockResolvedValue(2),
        delete: jest.fn().mockResolvedValue({ id: "warehouse_2" })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.deleteWarehouse(user, "warehouse_2")).resolves.toEqual({ id: "warehouse_2" });

    expect(prisma.warehouse.delete).toHaveBeenCalledWith({ where: { id: "warehouse_2" } });
  });

  it("blocks deleting warehouses with stock history", async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "warehouse_2",
          businessId: "business_1",
          branchId: "branch_1",
          status: "ACTIVE",
          isDefault: false,
          _count: { balances: 1, movements: 0, receipts: 0, adjustments: 0, sales: 0 }
        }),
        count: jest.fn().mockResolvedValue(2),
        delete: jest.fn()
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.deleteWarehouse(user, "warehouse_2")).rejects.toThrow("คลังนี้มีสต็อกหรือประวัติรายการแล้ว กรุณาปิดใช้งานแทนการลบ");

    expect(prisma.warehouse.delete).not.toHaveBeenCalled();
  });

  it("blocks deleting the last active warehouse in an active branch", async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "warehouse_2",
          businessId: "business_1",
          branchId: "branch_2",
          status: "ACTIVE",
          isDefault: false,
          _count: { balances: 0, movements: 0, receipts: 0, adjustments: 0, sales: 0 }
        }),
        count: jest.fn()
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(0),
        delete: jest.fn()
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_2", businessId: "business_1", status: "ACTIVE" })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.deleteWarehouse(user, "warehouse_2")).rejects.toThrow("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลังในสาขานี้");

    expect(prisma.warehouse.delete).not.toHaveBeenCalled();
  });

  it("returns product master rows as empty stock on warehouse detail", async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "warehouse_moon",
          businessId: "business_1",
          branchId: "branch_moon",
          name: "คลังหลัก",
          code: "WH-MOON",
          status: "ACTIVE",
          balances: [
            { productId: "product_stocked", warehouseId: "warehouse_moon", quantity: 2, product: { id: "product_stocked", name: "น้ำดื่ม", sku: "WATER", costPrice: 8, minStock: 5 } }
          ],
          movements: []
        })
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: "product_empty", name: "ขนม", sku: "SNACK", costPrice: 12, minStock: 3 },
          { id: "product_stocked", name: "น้ำดื่ม", sku: "WATER", costPrice: 8, minStock: 5 }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.getWarehouse(user, "warehouse_moon")).resolves.toEqual(expect.objectContaining({
      balances: [
        expect.objectContaining({ productId: "product_empty", warehouseId: "warehouse_moon", quantity: 0, product: expect.objectContaining({ id: "product_empty" }) }),
        expect.objectContaining({ productId: "product_stocked", warehouseId: "warehouse_moon", quantity: 2, product: expect.objectContaining({ id: "product_stocked" }) })
      ]
    }));

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business_1", status: { in: ["ACTIVE", "PAUSED", "DISCONTINUED"] } },
      orderBy: { name: "asc" }
    }));
  });

  it("rejects stock receipts without items", async () => {
    const service = new ZentoryService({} as any);

    await expect(service.receive(user, { items: [] })).rejects.toThrow("Receipt must include at least one item");
  });

  it("rejects sales without items", async () => {
    const service = new ZentoryService({} as any);

    await expect(service.createSale(user, { items: [], discount: 0, paymentMethod: "CASH" })).rejects.toThrow("Sale must include at least one item");
  });

  it("creates initial stock balance and movement when product has initialStock", async () => {
    const tx: any = {
      product: {
        create: jest.fn().mockResolvedValue({ id: "product_1", name: "น้ำดื่ม", costPrice: 5 }),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1" }),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: "product_1", balances: [{ quantity: 12 }], movements: [] })
      },
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ quantity: 12 })
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({})
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } })
      }
    };
    const prisma: any = {
      product: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", balances: [], movements: [] })
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } }) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.createProduct(user, {
      name: "น้ำดื่ม",
      sku: "DRINK-001",
      costPrice: 5,
      salePrice: 10,
      minStock: 3,
      initialStock: 12
    });

    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ quantity: 12 })
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "RECEIVE_IN",
        quantity: 12,
        balanceBefore: 0,
        balanceAfter: 12,
        reference: "INITIAL-STOCK"
      })
    }));
  });

  it("assigns a newly created product to a warehouse with zero stock when warehouseId is provided", async () => {
    const tx: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1", status: "ACTIVE" } })
      },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() },
      product: {
        create: jest.fn().mockResolvedValue({ id: "product_1" }),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: "product_1", balances: [{ warehouseId: "warehouse_1", quantity: 0 }] })
      },
      inventoryBalance: {
        upsert: jest.fn().mockResolvedValue({ quantity: 0 })
      },
      stockReceipt: { create: jest.fn() },
      stockMovement: { create: jest.fn() }
    };
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([])
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.createProduct(user, {
      name: "น้ำดื่ม",
      sku: "DRINK-001",
      costPrice: 5,
      salePrice: 10,
      minStock: 3,
      warehouseId: "warehouse_1"
    });

    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ businessId: "business_1", warehouseId: "warehouse_1", productId: "product_1", quantity: 0 }),
      update: {}
    }));
    expect(tx.stockReceipt.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("creates a product and stock receipt atomically when receiveNow is provided", async () => {
    const tx: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1", status: "ACTIVE" } })
      },
      category: { upsert: jest.fn().mockResolvedValue({ id: "category_1" }) },
      brand: { upsert: jest.fn().mockResolvedValue({ id: "brand_1" }) },
      product: {
        create: jest.fn().mockResolvedValue({ id: "product_1" }),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1" }),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: "product_1", balances: [{ quantity: 7 }], movements: [] })
      },
      stockReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt_1", documentNo: "REC-TEST" })
      },
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ quantity: 7 })
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([])
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await expect(service.createProduct(user, {
      name: "น้ำดื่ม",
      sku: "DRINK-001",
      categoryName: "เครื่องดื่ม",
      brandName: "Zentory",
      costPrice: 5,
      salePrice: 10,
      minStock: 3,
      receiveNow: { warehouseId: "warehouse_1", quantity: 7, unitCost: 4.5, supplier: "Demo Supply", note: "INV-1" }
    })).resolves.toEqual(expect.objectContaining({ id: "product_1" }));

    expect(tx.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "น้ำดื่ม", sku: "DRINK-001", categoryId: "category_1", brandId: "brand_1" })
    }));
    expect(tx.stockReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ warehouseId: "warehouse_1", supplier: "Demo Supply", note: "INV-1", totalCost: 31.5 })
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "RECEIVE_IN",
        productId: "product_1",
        quantity: 7,
        balanceBefore: 0,
        balanceAfter: 7,
        unitCost: 4.5,
        reference: "REC-TEST"
      })
    }));
  });

  it("rejects product creation for non-owner roles", async () => {
    const prisma: any = {
      product: { findMany: jest.fn() },
      businessSubscription: { findUnique: jest.fn() },
      $transaction: jest.fn()
    };
    const service = new ZentoryService(prisma);

    for (const role of ["MANAGER", "BRANCH_MANAGER", "STOCK_STAFF"] as const) {
      await expect(service.createProduct({ ...user, role }, {
        name: "น้ำดื่ม",
        sku: `DRINK-${role}`,
        costPrice: 5,
        salePrice: 10,
        minStock: 3,
        receiveNow: { warehouseId: "warehouse_1", quantity: 7, unitCost: 4.5 }
      })).rejects.toThrow("Only the store owner can manage product master data");
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not create a product when inline receiving targets an invalid warehouse", async () => {
    const tx: any = {
      warehouse: { findFirst: jest.fn().mockResolvedValue(null) },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() },
      product: { create: jest.fn() },
      stockReceipt: { create: jest.fn() },
      inventoryBalance: { findUnique: jest.fn(), upsert: jest.fn() },
      stockMovement: { create: jest.fn() }
    };
    const prisma: any = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await expect(service.createProduct(user, {
      name: "น้ำดื่ม",
      sku: "DRINK-001",
      costPrice: 5,
      salePrice: 10,
      minStock: 3,
      receiveNow: { warehouseId: "missing_warehouse", quantity: 7, unitCost: 4.5 }
    })).rejects.toThrow("Warehouse is not available for this business");

    expect(tx.product.create).not.toHaveBeenCalled();
    expect(tx.stockReceipt.create).not.toHaveBeenCalled();
  });

  it("creates one receipt and movements for multiple received items", async () => {
    const tx: any = {
      stockReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt_1", documentNo: "REC-TEST" })
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product" })
      },
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn()
          .mockResolvedValueOnce({ quantity: 5 })
          .mockResolvedValueOnce({ quantity: 8 })
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const prisma: any = {
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } }) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.receive(user, {
      supplier: "Demo Supply",
      items: [
        { productId: "product_1", quantity: 5, unitCost: 10 },
        { productId: "product_2", quantity: 8, unitCost: 20 }
      ]
    });

    expect(tx.stockReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ supplier: "Demo Supply", totalCost: 210 })
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ type: "RECEIVE_IN", productId: "product_1", quantity: 5, balanceBefore: 0, balanceAfter: 5 })
    }));
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ type: "RECEIVE_IN", productId: "product_2", quantity: 8, balanceBefore: 0, balanceAfter: 8 })
    }));
  });

  it("creates new products and receives them in the same receipt transaction", async () => {
    const tx: any = {
      stockReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt_1", documentNo: "REC-TEST" })
      },
      category: {
        upsert: jest.fn().mockResolvedValue({ id: "category_drinks" })
      },
      brand: {
        upsert: jest.fn().mockResolvedValue({ id: "brand_zentory" })
      },
      product: {
        create: jest.fn()
          .mockResolvedValueOnce({ id: "product_new_1" })
          .mockResolvedValueOnce({ id: "product_new_2" }),
        findFirst: jest.fn().mockResolvedValue({ id: "product" })
      },
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn()
          .mockResolvedValueOnce({ quantity: 12 })
          .mockResolvedValueOnce({ quantity: 4 })
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const prisma: any = {
      businessSubscription: { findUnique: jest.fn().mockResolvedValue({ plan: { productLimit: 20 } }) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } }) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.receive(user, {
      supplier: "Demo Supply",
      items: [
        {
          quantity: 12,
          unitCost: 5,
          newProduct: {
            name: "น้ำดื่ม 600ml",
            sku: "DRINK-600",
            categoryName: "เครื่องดื่ม",
            brandName: "Zentory",
            unit: "ขวด",
            salePrice: 10,
            minStock: 6
          }
        },
        {
          quantity: 4,
          unitCost: 20,
          newProduct: {
            name: "ขนม",
            sku: "SNACK-001",
            salePrice: 30,
            minStock: 2
          }
        }
      ]
    });

    expect(tx.product.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        businessId: "business_1",
        categoryId: "category_drinks",
        brandId: "brand_zentory",
        sku: "DRINK-600",
        costPrice: 5,
        salePrice: 10,
        minStock: 6
      })
    }));
    expect(tx.stockReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalCost: 140 })
    }));
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ productId: "product_new_1", quantity: 12, reference: "REC-TEST" })
    }));
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ productId: "product_new_2", quantity: 4, reference: "REC-TEST" })
    }));
  });

  it("blocks non-owners from creating products from a receipt", async () => {
    const prisma: any = {
      businessSubscription: { findUnique: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      $transaction: jest.fn()
    };
    const service = new ZentoryService(prisma);

    await expect(service.receive({ ...user, role: "STOCK_STAFF" }, {
      items: [{
        quantity: 1,
        unitCost: 10,
        newProduct: { name: "สินค้าใหม่", sku: "NEW-001", salePrice: 15, minStock: 0 }
      }]
    })).rejects.toThrow("Only the store owner can create new products from receiving");

    expect(prisma.warehouse.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects sales when stock is insufficient", async () => {
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: "product_1", salePrice: 25, costPrice: 10 }]),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1" })
      },
      sale: {
        create: jest.fn().mockResolvedValue({ id: "sale_1", receiptNo: "SALE-TEST", items: [] })
      },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      stockMovement: {
        create: jest.fn()
      }
    };
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch_1", status: "ACTIVE" }), findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } }) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await expect(service.createSale(user, {
      discount: 0,
      paymentMethod: "CASH",
      items: [{ productId: "product_1", quantity: 2 }]
    })).rejects.toThrow("Insufficient stock");
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("does not pass initialStock into product updates", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", balances: [], movements: [] }),
        update: jest.fn().mockResolvedValue({ id: "product_1" })
      },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await service.updateProduct(user, "product_1", {
      name: "Updated",
      sku: "SKU-001",
      costPrice: 10,
      salePrice: 20,
      minStock: 3,
      initialStock: 99
    });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ initialStock: expect.anything() })
    }));
  });

  it("searches products by category and brand names", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new ZentoryService(prisma);

    await service.listProducts(user, " เครื่องดื่ม ");

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { category: { is: { name: { contains: "เครื่องดื่ม", mode: "insensitive" } } } },
          { brand: { is: { name: { contains: "เครื่องดื่ม", mode: "insensitive" } } } }
        ])
      })
    }));
  });

  it("returns product master rows for a selected branch and scopes only balances", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_bangkok", status: "ACTIVE" })
      },
      product: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new ZentoryService(prisma);

    await service.listProducts(user, "", undefined, "branch_bangkok");

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1"
      }),
      include: expect.objectContaining({
        balances: expect.objectContaining({ where: { warehouse: { branchId: "branch_bangkok" } } })
      })
    }));
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({
        balances: expect.anything()
      })
    }));
  });

  it("filters product lists by the selected branch lifecycle status", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_bangkok", status: "ACTIVE" })
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: "paused_here", name: "Paused here", status: "ACTIVE", branchStatuses: [{ status: "PAUSED" }], balances: [] },
          { id: "active_here", name: "Active here", status: "ACTIVE", branchStatuses: [], balances: [] }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.listProducts(user, "", "ACTIVE", "branch_bangkok")).resolves.toEqual([
      expect.objectContaining({ id: "active_here", status: "ACTIVE" })
    ]);
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        branchStatuses: { where: { branchId: "branch_bangkok" } }
      })
    }));
  });

  it("updates product lifecycle status only for the selected branch", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_bangkok", status: "ACTIVE" })
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", status: "ACTIVE", branchStatuses: [], balances: [], movements: [] }),
        update: jest.fn()
      },
      productBranchStatus: {
        upsert: jest.fn().mockResolvedValue({ id: "pbs_1" })
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService(prisma);

    await expect(service.pauseProduct(user, "product_1", "branch_bangkok")).resolves.toEqual(expect.objectContaining({ id: "product_1", status: "PAUSED" }));
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.productBranchStatus.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId_productId_branchId: { businessId: "business_1", productId: "product_1", branchId: "branch_bangkok" } },
      create: expect.objectContaining({ status: "PAUSED" }),
      update: { status: "PAUSED" }
    }));
  });

  it("searches inventory across warehouses and excludes archived products", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: "product_empty", name: "น้ำดื่มเล็ก", balances: [{ quantity: 0 }] },
          { id: "product_stocked", name: "น้ำดื่มแพ็ก", balances: [{ quantity: 4 }, { quantity: 6 }] }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.searchInventory(user, " น้ำดื่ม ")).resolves.toEqual([
      expect.objectContaining({ id: "product_stocked" }),
      expect.objectContaining({ id: "product_empty" })
    ]);

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1",
        status: { in: ["ACTIVE", "PAUSED", "DISCONTINUED"] },
        OR: expect.arrayContaining([
          { name: { contains: "น้ำดื่ม", mode: "insensitive" } },
          { sku: { contains: "น้ำดื่ม", mode: "insensitive" } },
          { barcode: { contains: "น้ำดื่ม" } },
          { category: { is: { name: { contains: "น้ำดื่ม", mode: "insensitive" } } } },
          { brand: { is: { name: { contains: "น้ำดื่ม", mode: "insensitive" } } } }
        ])
      }),
      include: expect.objectContaining({
        balances: { include: { warehouse: { include: { branch: true } } } }
      }),
      take: 100
    }));
  });

  it("does not run broad inventory searches for short queries", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn()
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.searchInventory(user, "a")).resolves.toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("creates an owner transfer as in-transit and removes source stock immediately", async () => {
    const tx: any = {
      warehouse: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: "source", branchId: "branch_source", businessId: "business_1", status: "ACTIVE", branch: { status: "ACTIVE" } })
          .mockResolvedValueOnce({ id: "dest", branchId: "branch_dest", businessId: "business_1", status: "ACTIVE", branch: { status: "ACTIVE" } })
      },
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: "product_1", costPrice: 10, status: "ACTIVE" }]),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1" })
      },
      stockTransfer: {
        create: jest.fn().mockResolvedValue({ id: "transfer_1", documentNo: "TRF-TEST", status: "REQUESTED", items: [] }),
        update: jest.fn().mockResolvedValue({ id: "transfer_1", documentNo: "TRF-TEST", status: "IN_TRANSIT", items: [] })
      },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ quantity: 3 })
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new ZentoryService(prisma);

    await expect(service.createTransfer(user, {
      sourceWarehouseId: "source",
      destinationWarehouseId: "dest",
      items: [{ productId: "product_1", quantity: 2 }],
      note: "ย้ายไปขายอีกสาขา"
    })).resolves.toEqual(expect.objectContaining({ status: "IN_TRANSIT" }));

    expect(tx.stockTransfer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceWarehouseId: "source",
        destinationWarehouseId: "dest",
        status: "REQUESTED",
        items: { create: [{ productId: "product_1", quantity: 2, unitCost: 10 }] }
      })
    }));
    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business_1", warehouseId: "source", productId: "product_1", quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } }
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ warehouseId: "source", productId: "product_1", type: "TRANSFER_OUT", quantity: 2, reference: "TRF-TEST" })
    }));
    expect(tx.stockTransfer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "IN_TRANSIT", sourceApprovedById: user.userId })
    }));
  });

  it("creates a staff transfer request without removing source stock", async () => {
    const staffUser = { ...user, role: "STOCK_STAFF", assignedBranchIds: ["branch_dest"] };
    const tx: any = {
      warehouse: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: "source", branchId: "branch_source", businessId: "business_1", status: "ACTIVE", branch: { status: "ACTIVE" } })
          .mockResolvedValueOnce({ id: "dest", branchId: "branch_dest", businessId: "business_1", status: "ACTIVE", branch: { status: "ACTIVE" } })
      },
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: "product_1", costPrice: 10, status: "ACTIVE" }])
      },
      stockTransfer: {
        create: jest.fn().mockResolvedValue({ id: "transfer_1", documentNo: "TRF-TEST", status: "REQUESTED", items: [] })
      }
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
      branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch_dest", status: "ACTIVE" }) }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createTransfer(staffUser, {
      sourceWarehouseId: "source",
      destinationWarehouseId: "dest",
      items: [{ productId: "product_1", quantity: 2 }]
    })).resolves.toEqual(expect.objectContaining({ status: "REQUESTED" }));
    expect(tx.inventoryBalance?.updateMany).toBeUndefined();
    expect(tx.stockMovement?.create).toBeUndefined();
  });

  it("approves a transfer request and removes source stock", async () => {
    const transfer = {
      id: "transfer_1",
      businessId: "business_1",
      sourceWarehouseId: "source",
      destinationWarehouseId: "dest",
      status: "REQUESTED",
      documentNo: "TRF-TEST",
      items: [{ productId: "product_1", quantity: 2, unitCost: 10 }]
    };
    const tx: any = {
      stockTransfer: {
        findFirst: jest.fn().mockResolvedValue(transfer),
        update: jest.fn().mockResolvedValue({ ...transfer, status: "IN_TRANSIT" })
      },
      warehouse: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "source", branchId: "branch_1" }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: "product_1" }) },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ quantity: 3 })
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService({ $transaction: jest.fn((callback) => callback(tx)) } as any);

    await expect(service.approveTransferSource(user, "transfer_1")).resolves.toEqual(expect.objectContaining({ status: "IN_TRANSIT" }));
    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business_1", warehouseId: "source", productId: "product_1", quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } }
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ warehouseId: "source", productId: "product_1", type: "TRANSFER_OUT", quantity: 2, reference: "TRF-TEST" })
    }));
  });

  it("rejects transfers to the same warehouse and insufficient stock", async () => {
    const service = new ZentoryService({} as any);
    await expect(service.createTransfer(user, {
      sourceWarehouseId: "same",
      destinationWarehouseId: "same",
      items: [{ productId: "product_1", quantity: 1 }]
    })).rejects.toThrow("ต้นทางและปลายทางต้องเป็นคนละคลัง");

    const tx: any = {
      stockTransfer: { findFirst: jest.fn().mockResolvedValue({ id: "transfer_1", status: "REQUESTED", sourceWarehouseId: "source", documentNo: "TRF-TEST", items: [{ productId: "product_1", quantity: 4, unitCost: 10 }] }) },
      warehouse: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "source", branchId: "branch_1" }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: "product_1" }) },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      stockMovement: { create: jest.fn() }
    };
    const serviceWithStock = new ZentoryService({ $transaction: jest.fn((callback) => callback(tx)) } as any);
    await expect(serviceWithStock.approveTransferSource(user, "transfer_1")).rejects.toThrow("Insufficient stock");
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("receives an in-transit transfer into the destination warehouse", async () => {
    const transfer = {
      id: "transfer_1",
      businessId: "business_1",
      destinationWarehouseId: "dest",
      sourceWarehouseId: "source",
      status: "IN_TRANSIT",
      documentNo: "TRF-TEST",
      items: [{ productId: "product_1", quantity: 2, unitCost: 10 }]
    };
    const tx: any = {
      stockTransfer: {
        findFirst: jest.fn().mockResolvedValue(transfer),
        update: jest.fn().mockResolvedValue({ ...transfer, status: "RECEIVED" })
      },
      warehouse: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "dest", branchId: "branch_1" }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: "product_1" }) },
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 1 }),
        upsert: jest.fn().mockResolvedValue({ quantity: 3 })
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService({ $transaction: jest.fn((callback) => callback(tx)) } as any);

    await expect(service.receiveTransfer(user, "transfer_1")).resolves.toEqual(expect.objectContaining({ status: "RECEIVED" }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ warehouseId: "dest", type: "TRANSFER_IN", balanceBefore: 1, balanceAfter: 3 })
    }));
  });

  it("cancels an in-transit transfer and returns stock to source", async () => {
    const transfer = {
      id: "transfer_1",
      businessId: "business_1",
      destinationWarehouseId: "dest",
      sourceWarehouseId: "source",
      status: "IN_TRANSIT",
      documentNo: "TRF-TEST",
      items: [{ productId: "product_1", quantity: 2, unitCost: 10 }]
    };
    const tx: any = {
      stockTransfer: {
        findFirst: jest.fn().mockResolvedValue(transfer),
        update: jest.fn().mockResolvedValue({ ...transfer, status: "CANCELED" })
      },
      warehouse: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "source", branchId: "branch_1" }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: "product_1" }) },
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 3 }),
        upsert: jest.fn().mockResolvedValue({ quantity: 5 })
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService({ $transaction: jest.fn((callback) => callback(tx)) } as any);

    await expect(service.cancelTransfer(user, "transfer_1")).resolves.toEqual(expect.objectContaining({ status: "CANCELED" }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ warehouseId: "source", type: "TRANSFER_CANCEL", balanceBefore: 3, balanceAfter: 5 })
    }));
  });

  it("blocks receiving or canceling completed transfers", async () => {
    const tx: any = {
      stockTransfer: {
        findFirst: jest.fn().mockResolvedValue({ id: "transfer_1", status: "RECEIVED", items: [] })
      }
    };
    const service = new ZentoryService({ $transaction: jest.fn((callback) => callback(tx)) } as any);

    await expect(service.receiveTransfer(user, "transfer_1")).rejects.toThrow("รับได้เฉพาะเอกสารที่อยู่ระหว่างทาง");
    await expect(service.cancelTransfer(user, "transfer_1")).rejects.toThrow("ยกเลิกได้เฉพาะคำขอที่รออนุมัติหรือเอกสารที่อยู่ระหว่างทาง");
  });

  it("lists and protects product categories", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_main", status: "ACTIVE" })
      },
      category: {
        findMany: jest.fn().mockResolvedValue([{ id: "category_1", name: "เครื่องดื่ม", products: [{ id: "product_1", name: "น้ำเปล่า", sku: "WATER-01", imagePath: null, unit: "ขวด", balances: [{ quantity: 12 }] }], _count: { products: 2 } }]),
        findFirst: jest.fn().mockResolvedValue({ id: "category_1", name: "เครื่องดื่ม", _count: { products: 2 } }),
        delete: jest.fn()
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.listCategories(user, "branch_main")).resolves.toEqual([expect.objectContaining({ name: "เครื่องดื่ม" })]);
    expect(prisma.branch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "branch_main", businessId: "business_1" }
    }));
    expect(prisma.category.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        _count: { select: { products: true } },
        products: expect.objectContaining({
          select: {
            id: true,
            name: true,
            sku: true,
            imagePath: true,
            unit: true,
            balances: {
              where: { warehouse: { branchId: "branch_main" } },
              select: { quantity: true }
            }
          },
          take: 5
        })
      })
    }));
    await expect(service.deleteCategory(user, "category_1")).rejects.toThrow("หมวดหมู่นี้ยังมีสินค้าใช้งานอยู่");
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it("creates and updates product categories", async () => {
    const prisma: any = {
      category: {
        create: jest.fn().mockResolvedValue({ id: "category_1", name: "เครื่องดื่ม", color: "#0f766e", _count: { products: 0 } }),
        findFirst: jest.fn().mockResolvedValue({ id: "category_1", name: "เครื่องดื่ม" }),
        update: jest.fn().mockResolvedValue({ id: "category_1", name: "เครื่องดื่มเย็น", color: "#2563eb", _count: { products: 0 } })
      }
    };
    const service = new ZentoryService(prisma);

    await service.createCategory(user, { name: " เครื่องดื่ม ", color: "#0f766e" });
    await service.updateCategory(user, "category_1", { name: " เครื่องดื่มเย็น ", color: "" });

    expect(prisma.category.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessId: "business_1", name: "เครื่องดื่ม", color: "#0f766e" })
    }));
    expect(prisma.category.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: "เครื่องดื่มเย็น", color: "#2563eb" }
    }));
  });

  it("returns a user-friendly error when creating a product with a duplicate sku", async () => {
    const prisma: any = {
      product: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue({ code: "P2002", meta: { target: ["businessId", "sku"] } })
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createProduct(user, {
      name: "Duplicate",
      sku: "DUP-001",
      costPrice: 5,
      salePrice: 10,
      minStock: 1
    })).rejects.toThrow("SKU นี้ถูกใช้แล้ว กรุณาใช้ SKU อื่น");
  });

  it("returns a user-friendly error when updating a product to a duplicate sku", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", balances: [], movements: [] }),
        update: jest.fn().mockRejectedValue({ code: "P2002", meta: { target: ["businessId", "sku"] } })
      },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateProduct(user, "product_1", {
      name: "Duplicate",
      sku: "DUP-001",
      costPrice: 5,
      salePrice: 10,
      minStock: 1
    })).rejects.toThrow("SKU นี้ถูกใช้แล้ว กรุณาใช้ SKU อื่น");
  });

  it("returns a user-friendly error when creating a product with a duplicate barcode", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue({ code: "P2002", meta: { target: ["businessId", "barcode"] } })
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createProduct(user, {
      name: "Duplicate barcode",
      sku: "BAR-001",
      barcode: "8850000000012",
      costPrice: 5,
      salePrice: 10,
      minStock: 1
    })).rejects.toThrow("Barcode นี้ถูกใช้แล้ว กรุณาใช้ barcode อื่น");
  });

  it("records audit log before and after values when updating product data", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "product_1",
          name: "Old name",
          sku: "OLD-001",
          barcode: "111",
          description: "Old note",
          unit: "ชิ้น",
          costPrice: 5,
          salePrice: 10,
          minStock: 2,
          categoryId: null,
          brandId: null,
          category: null,
          brand: null,
          balances: [],
          movements: []
        }),
        update: jest.fn().mockResolvedValue({ id: "product_1", name: "New name" })
      },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService(prisma);

    await service.updateProduct(user, "product_1", {
      name: "New name",
      sku: "NEW-001",
      barcode: "222",
      description: "New note",
      unit: "แพ็ก",
      costPrice: 6,
      salePrice: 12,
      minStock: 3
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "product.update",
        entity: "Product",
        entityId: "product_1",
        before: expect.objectContaining({ name: "Old name", sku: "OLD-001", barcode: "111", description: "Old note", minStock: 2 }),
        after: expect.objectContaining({ name: "New name", sku: "NEW-001", barcode: "222", description: "New note", minStock: 3 })
      })
    }));
  });

  it("does not create a product audit log when saved data is unchanged", async () => {
    const existingProduct = {
      id: "product_1",
      name: "Same name",
      sku: "SKU-001",
      barcode: "111",
      description: "Same note",
      unit: "ชิ้น",
      costPrice: 5,
      salePrice: 10,
      minStock: 2,
      categoryId: null,
      brandId: null,
      category: null,
      brand: null,
      balances: [],
      movements: []
    };
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue(existingProduct),
        update: jest.fn().mockResolvedValue(existingProduct)
      },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService(prisma);

    await service.updateProduct(user, "product_1", {
      name: "Same name",
      sku: "SKU-001",
      barcode: "111",
      description: "Same note",
      unit: "ชิ้น",
      costPrice: 5,
      salePrice: 10,
      minStock: 2
    });

    expect(prisma.product.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows owners to list business audit logs", async () => {
    const prisma: any = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "audit_1",
            entity: "Product",
            createdAt: new Date("2026-06-18T00:00:00.000Z"),
            before: { name: "Old", sku: "OLD-001", passwordHash: "secret", rawPayload: { token: "token" } },
            after: { name: "New", sku: "NEW-001", accessToken: "token", salePrice: 120 },
            user: { id: "owner_1", name: "Owner", email: "owner@example.com" }
          }
        ])
      },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const service = new ZentoryService(prisma);

    const result = await service.listAuditLogs({ ...user, userId: "owner_1", role: "OWNER" }, { limit: 10 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: "business_1" })
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].before).toEqual({ name: "Old", sku: "OLD-001" });
    expect(result.items[0].after).toEqual({ name: "New", sku: "NEW-001", salePrice: 120 });
  });

  it("blocks non-owner roles from listing business audit logs", async () => {
    const prisma: any = {
      auditLog: { findMany: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.listAuditLogs({ ...user, role: "MANAGER" })).rejects.toThrow("Audit log is restricted to owners");
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("backfills stock balance before and after for legacy stock adjustment audit logs", async () => {
    const prisma: any = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "audit_stock",
            entity: "StockAdjustment",
            createdAt: new Date("2026-06-19T00:00:00.000Z"),
            before: null,
            after: { documentNo: "ADJ-001", quantity: -1, targetQuantity: 9 },
            user: null
          }
        ])
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([{ reference: "ADJ-001", balanceBefore: 10, balanceAfter: 9 }])
      }
    };
    const service = new ZentoryService(prisma);

    const result = await service.listAuditLogs(user, { limit: 10 });

    expect(result.items[0].before).toEqual({ stockOnHand: 10 });
    expect(result.items[0].after).toEqual(expect.objectContaining({ documentNo: "ADJ-001", stockOnHand: 9 }));
  });

  it("updates product lifecycle status through product edits without archiving", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "product_1",
          name: "Old name",
          sku: "OLD-001",
          unit: "ชิ้น",
          costPrice: 5,
          salePrice: 10,
          minStock: 2,
          status: "ACTIVE",
          categoryId: null,
          brandId: null,
          balances: [],
          movements: []
        }),
        update: jest.fn().mockResolvedValue({ id: "product_1", status: "PAUSED" })
      },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService(prisma);

    await service.updateProduct(user, "product_1", {
      name: "Old name",
      sku: "OLD-001",
      costPrice: 5,
      salePrice: 10,
      minStock: 2,
      status: "PAUSED"
    });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PAUSED" })
    }));
  });

  it("rejects archived status changes through product edits", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", status: "ACTIVE", balances: [], movements: [] }),
        update: jest.fn()
      },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateProduct(user, "product_1", {
      name: "Old name",
      sku: "OLD-001",
      costPrice: 5,
      salePrice: 10,
      minStock: 2,
      status: "ARCHIVED" as any
    })).rejects.toThrow("Use archive action to archive products");
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("uploads a product image and replaces the previous image path", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "product_1",
          businessId: "business_1",
          imagePath: "/uploads/products/old.webp",
          balances: [],
          movements: []
        }),
        update: jest.fn().mockResolvedValue({ id: "product_1", imagePath: "/uploads/products/new.webp" })
      }
    };
    const storage: any = {
      validate: jest.fn(),
      saveProductImage: jest.fn().mockResolvedValue("/uploads/products/new.webp"),
      deleteProductImage: jest.fn().mockResolvedValue(undefined)
    };
    const service = new ZentoryService(prisma, storage);

    await expect(service.updateProductImage(user, "product_1", {
      originalname: "photo.webp",
      mimetype: "image/webp",
      size: 1200,
      buffer: Buffer.from("image")
    })).resolves.toEqual({ id: "product_1", imagePath: "/uploads/products/new.webp" });

    expect(storage.saveProductImage).toHaveBeenCalledWith(expect.objectContaining({ mimetype: "image/webp" }));
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "product_1" },
      data: { imagePath: "/uploads/products/new.webp" }
    });
    expect(storage.deleteProductImage).toHaveBeenCalledWith("/uploads/products/old.webp");
  });

  it("rejects product image uploads with unsupported file types or oversized files", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", imagePath: null, balances: [], movements: [] })
      }
    };
    const storage = new ProductImageStorageService();
    const saveProductImage = jest.spyOn(storage, "saveProductImage");
    const service = new ZentoryService(prisma, storage);

    await expect(service.updateProductImage(user, "product_1", {
      originalname: "photo.gif",
      mimetype: "image/gif",
      size: 1200,
      buffer: Buffer.from("image")
    })).rejects.toThrow("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP");

    await expect(service.updateProductImage(user, "product_1", {
      originalname: "photo.png",
      mimetype: "image/png",
      size: 5 * 1024 * 1024 + 1,
      buffer: Buffer.from("image")
    })).rejects.toThrow("ขนาดรูปสินค้าต้องไม่เกิน 5MB");
    expect(saveProductImage).not.toHaveBeenCalled();
  });

  it("deletes a product image and clears the image path", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "product_1",
          businessId: "business_1",
          imagePath: "/uploads/products/old.webp",
          balances: [],
          movements: []
        }),
        update: jest.fn().mockResolvedValue({ id: "product_1", imagePath: null })
      }
    };
    const storage: any = {
      deleteProductImage: jest.fn().mockResolvedValue(undefined)
    };
    const service = new ZentoryService(prisma, storage);

    await expect(service.deleteProductImage(user, "product_1")).resolves.toEqual({ id: "product_1", imagePath: null });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "product_1" },
      data: { imagePath: null }
    });
    expect(storage.deleteProductImage).toHaveBeenCalledWith("/uploads/products/old.webp");
  });

  it("includes active products without balance in stock report as OUT", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "product_1",
            sku: "SNACK-001",
            name: "ขนม",
            minStock: 5,
            costPrice: 8,
            balances: []
          }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.stockReport(user)).resolves.toEqual([
      {
        productId: "product_1",
        sku: "SNACK-001",
        name: "ขนม",
        quantity: 0,
        minStock: 5,
        stockValue: 0,
        status: "OUT"
      }
    ]);
  });

  it("filters stock report balances by selected location", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new ZentoryService(prisma);

    await service.stockReport(user, { branchId: "branch_2", warehouseId: "warehouse_2" });

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1"
      }),
      include: {
        balances: {
          where: {
            warehouseId: "warehouse_2",
            warehouse: { branchId: "branch_2" }
          }
        }
      }
    }));
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({
        balances: expect.anything()
      })
    }));
  });

  it("filters inventory balances by selected location", async () => {
    const prisma: any = {
      inventoryBalance: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new ZentoryService(prisma);

    await service.balances(user, { branchId: "branch_2", warehouseId: "warehouse_2" });

    expect(prisma.inventoryBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId: "business_1",
        product: { status: { in: ["ACTIVE", "PAUSED", "DISCONTINUED"] } },
        warehouseId: "warehouse_2",
        warehouse: { branchId: "branch_2" }
      }
    }));
  });

  it("includes empty product master rows in branch stock alerts", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new ZentoryService(prisma);

    await service.stockReport(user, { branchId: "branch_bangkok" });

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1"
      }),
      include: expect.objectContaining({
        balances: { where: { warehouse: { branchId: "branch_bangkok" } } }
      })
    }));
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({
        balances: expect.anything()
      })
    }));
  });

  it("filters sales report and top products by selected location", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-14T10:00:00.000Z"));
    const prisma: any = {
      sale: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0, discount: 0 } })
      },
      saleItem: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } })
      }
    };
    const service = new ZentoryService(prisma);

    await service.salesReport(user, { branchId: "branch_2", warehouseId: "warehouse_2" });

    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1",
        status: "PAID",
        branchId: "branch_2",
        warehouseId: "warehouse_2"
      })
    }));
    expect(prisma.saleItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sale: expect.objectContaining({
          businessId: "business_1",
          status: "PAID",
          branchId: "branch_2",
          warehouseId: "warehouse_2"
        })
      }
    }));
    jest.useRealTimers();
  });

  it("calculates sales report totals from all matching sales instead of the recent row limit", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-14T10:00:00.000Z"));
    const prisma: any = {
      sale: {
        findMany: jest.fn().mockResolvedValue([{
          id: "sale_recent",
          receiptNo: "SALE-RECENT",
          createdAt: new Date("2026-06-14T09:00:00.000Z"),
          total: 500,
          discount: 20,
          paymentMethod: "CASH",
          branch: { id: "branch_1", name: "สาขาหลัก" },
          warehouse: { id: "warehouse_1", name: "หน้าร้าน" },
          user: { name: "Owner" },
          items: [{ quantity: 2 }]
        }]),
        count: jest.fn().mockResolvedValue(350),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 123456, discount: 789 } })
      },
      saleItem: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 912 } })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.salesReport(user, { branchId: "branch_1" })).resolves.toMatchObject({
      summary: {
        totalRevenue: 123456,
        receiptCount: 350,
        averageReceipt: 123456 / 350,
        totalDiscount: 789,
        totalUnits: 912
      }
    });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 8 }));
    expect(prisma.sale.count).toHaveBeenCalledWith({ where: expect.objectContaining({ branchId: "branch_1" }) });
    expect(prisma.sale.aggregate).toHaveBeenCalledWith({ where: expect.objectContaining({ branchId: "branch_1" }), _sum: { total: true, discount: true } });
    expect(prisma.saleItem.aggregate).toHaveBeenCalledWith({ where: { sale: expect.objectContaining({ branchId: "branch_1" }) }, _sum: { quantity: true } });
    jest.useRealTimers();
  });

  it("accepts custom sales report date filters", async () => {
    const prisma: any = {
      sale: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0, discount: 0 } })
      },
      saleItem: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } })
      }
    };
    const service = new ZentoryService(prisma);

    await service.salesReport(user, {
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-07T23:59:59.999Z"
    });

    expect(prisma.sale.findMany.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date("2026-06-01T00:00:00.000Z"),
      lte: new Date("2026-06-07T23:59:59.999Z")
    });
  });

  it("paginates and filters sales history on the server", async () => {
    const prisma: any = {
      sale: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(42),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 1234 } })
      },
      saleItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 17 } })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.listSales(user, {
      page: 3,
      limit: 10,
      q: " snack ",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-14T23:59:59.999Z",
      paymentMethod: "TRANSFER"
    })).resolves.toMatchObject({
      data: [],
      meta: { page: 3, limit: 10, total: 42, totalPages: 5 },
      summary: { total: 1234, units: 17 }
    });

    const where = prisma.sale.findMany.mock.calls[0][0].where;
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 10,
      where: expect.objectContaining({
        businessId: "business_1",
        paymentMethod: "TRANSFER",
        createdAt: {
          gte: new Date("2026-06-01T00:00:00.000Z"),
          lte: new Date("2026-06-14T23:59:59.999Z")
        },
        OR: expect.arrayContaining([
          { receiptNo: { contains: "snack", mode: "insensitive" } },
          { items: { some: { product: { sku: { contains: "snack", mode: "insensitive" } } } } }
        ])
      })
    }));
    expect(prisma.sale.count).toHaveBeenCalledWith({ where });
    expect(prisma.saleItem.aggregate).toHaveBeenCalledWith({ where: { sale: where }, _sum: { quantity: true } });
  });

  it("exports filtered sales as csv", async () => {
    const prisma: any = {
      sale: {
        findMany: jest.fn().mockResolvedValue([{
          receiptNo: "SALE-001",
          createdAt: new Date("2026-06-14T10:00:00.000Z"),
          status: "PAID",
          paymentMethod: "CASH",
          branch: { name: "สาขาหลัก" },
          warehouse: { name: "หน้าร้าน" },
          user: { name: "Demo User" },
          subtotal: "100",
          discount: "5",
          total: "95",
          items: [
            { quantity: 2, product: { name: "Snack, Large" } }
          ]
        }])
      }
    };
    const service = new ZentoryService(prisma);

    const csv = await service.exportSalesCsv(user, { q: "SALE-001" });

    expect(csv).toContain("\"เลขที่\",\"วันที่\",\"สถานะ\"");
    expect(csv).toContain("\"SALE-001\"");
    expect(csv).toContain("\"Snack, Large x 2\"");
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 5000,
      where: expect.objectContaining({ businessId: "business_1" })
    }));
  });

  it("builds an owner dashboard with target progress, seven-day sales, and top products", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-14T10:00:00.000Z"));
    const paidToday = { id: "sale_today", receiptNo: "RC-1", total: 300, createdAt: new Date("2026-06-14T02:00:00.000Z") };
    const products = [
      { id: "product_1", sku: "COF-001", name: "Coffee", status: "ACTIVE", costPrice: 50, minStock: 5, balances: [{ quantity: 3 }] },
      { id: "product_2", sku: "TEA-001", name: "Tea", status: "ACTIVE", costPrice: 20, minStock: 2, balances: [] }
    ];
    const prisma: any = {
      business: { findUniqueOrThrow: jest.fn().mockResolvedValue({ salesTargetMode: "ANNUAL", annualSalesTarget: 120000, dailySalesTarget: null, monthlySalesTarget: null }) },
      sale: {
        aggregate: jest.fn()
          .mockResolvedValueOnce({ _sum: { total: 300 } })
          .mockResolvedValueOnce({ _sum: { total: 150 } })
          .mockResolvedValueOnce({ _sum: { total: 1200 } }),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn()
          .mockResolvedValueOnce([paidToday, { total: 900, createdAt: new Date("2026-06-12T02:00:00.000Z") }])
          .mockResolvedValueOnce([
            paidToday,
            { total: 900, createdAt: new Date("2026-06-12T02:00:00.000Z") },
            { total: 500, createdAt: new Date("2026-06-03T02:00:00.000Z") }
          ])
          .mockResolvedValueOnce([paidToday])
      },
      product: { findMany: jest.fn().mockResolvedValue(products) },
      inventoryBalance: {
        findMany: jest.fn().mockResolvedValue([
          { productId: "product_1", quantity: 3, product: products[0] }
        ])
      },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      saleItem: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ quantity: 2, total: 300, unitCost: 50, product: { id: "product_1", name: "Coffee", sku: "COF-001" } }])
          .mockResolvedValueOnce([
            { quantity: 2, total: 300, unitCost: 50, product: { id: "product_1", name: "Coffee", sku: "COF-001" } },
            { quantity: 1, total: 120, unitCost: 20, product: { id: "product_2", name: "Tea", sku: "TEA-001" } }
          ])
      }
    };
    const service = new ZentoryService(prisma);

    const result = await service.dashboard(user);

    expect(result).toEqual(expect.objectContaining({
      role: "OWNER",
      goals: {
        salesTargetMode: "ANNUAL",
        annualSalesTarget: 120000,
        dailySalesTarget: 10000 / 30,
        monthlySalesTarget: 10000,
        daysInCurrentMonth: 30
      },
      sales: expect.objectContaining({
        todayTotal: 300,
        yesterdayTotal: 150,
        todayReceiptCount: 1,
        averageReceiptValue: 300,
        todayGrossProfit: 200,
        todayChangePercent: 100,
        monthTotal: 1200,
        trend30Days: {
          total: 1700,
          averageDailySales: 1700 / 30,
          receiptCount: 3,
          last7DaysTotal: 1200,
          previous7DaysTotal: 500,
          last7DaysChangePercent: 140,
          bestDay: { date: "2026-06-12", total: 900 }
        },
        dailyTargetProgress: { target: 10000 / 30, current: 300, percent: 90, remaining: (10000 / 30) - 300, reached: false }
      }),
      inventory: expect.objectContaining({
        totalProducts: 2,
        lowStockProducts: 1,
        outOfStockProducts: 1
      }),
      topProducts: expect.objectContaining({
        today: [expect.objectContaining({ productId: "product_1", quantity: 2, revenue: 300, grossProfit: 200 })],
        last7Days: expect.arrayContaining([expect.objectContaining({ productId: "product_2", quantity: 1, revenue: 120, grossProfit: 100 })])
      })
    }));

    expect(result.sales.last7Days).toHaveLength(7);
    expect(result.sales.last7Days.at(-1)).toEqual({ date: "2026-06-14", total: 300 });
    jest.useRealTimers();
  });

  it("builds an empty dashboard sales trend and keeps branch scope on dashboard sales queries", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-14T10:00:00.000Z"));
    const prisma: any = {
      business: { findUniqueOrThrow: jest.fn().mockResolvedValue({ salesTargetMode: "ANNUAL", annualSalesTarget: null, dailySalesTarget: null, monthlySalesTarget: null }) },
      sale: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: null } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([])
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      saleItem: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const service = new ZentoryService(prisma);

    const result = await service.dashboard(user, { branchId: "branch_1" });

    expect(result.sales.trend30Days).toEqual({
      total: 0,
      averageDailySales: 0,
      receiptCount: 0,
      last7DaysTotal: 0,
      previous7DaysTotal: 0,
      last7DaysChangePercent: 0,
      bestDay: null
    });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId: "branch_1" })
    }));
    jest.useRealTimers();
  });

  it("updates dashboard sales targets", async () => {
    const prisma: any = {
      business: {
        update: jest.fn().mockResolvedValue({ id: "business_1", salesTargetMode: "MONTHLY", monthlySalesTarget: 15000 })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateDashboardGoals(user, { salesTargetMode: "MONTHLY", annualSalesTarget: null, monthlySalesTarget: 15000, dailySalesTarget: null })).resolves.toEqual(expect.objectContaining({ monthlySalesTarget: 15000 }));
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "business_1" },
      data: { salesTargetMode: "MONTHLY", annualSalesTarget: null, dailySalesTarget: null, monthlySalesTarget: 15000 }
    });
  });

  it("updates commercial business settings with trimmed optional metadata", async () => {
    const prisma: any = {
      business: {
        update: jest.fn().mockResolvedValue({ id: "business_1", currency: "THB", taxRate: 7 })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateBusiness(user, {
      name: " Kong Mart ",
      province: " Lopburi ",
      businessType: " ร้านขายของชำ ",
      branchCount: "2-3",
      address: " 99 Main Road ",
      phone: " 080-000-0000 ",
      email: " ",
      taxId: " 0150000000000 ",
      logoUrl: " https://example.com/logo.png ",
      receiptFooter: " ขอบคุณที่ใช้บริการ ",
      currency: " thb ",
      taxRate: 7
    })).resolves.toEqual(expect.objectContaining({ currency: "THB", taxRate: 7 }));

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "business_1" },
      data: {
        name: "Kong Mart",
        province: "Lopburi",
        businessType: "ร้านขายของชำ",
        branchCount: "2-3",
        address: "99 Main Road",
        phone: "080-000-0000",
        email: null,
        taxId: "0150000000000",
        logoUrl: "https://example.com/logo.png",
        receiptFooter: "ขอบคุณที่ใช้บริการ",
        currency: "THB",
        taxRate: 7
      }
    });
  });

  it("derives targets from monthly and daily goal modes", () => {
    const service = new ZentoryService({} as any);
    expect((service as any).deriveSalesTargets("MONTHLY", null, 12000, null, 30)).toEqual({
      salesTargetMode: "MONTHLY",
      annualSalesTarget: 144000,
      monthlySalesTarget: 12000,
      dailySalesTarget: 400
    });
    expect((service as any).deriveSalesTargets("DAILY", null, null, 500, 31)).toEqual({
      salesTargetMode: "DAILY",
      annualSalesTarget: 182500,
      monthlySalesTarget: 15500,
      dailySalesTarget: 500
    });
  });

  it("calculates Bangkok month length for 28, 29, 30, and 31 day months", () => {
    const service = new ZentoryService({} as any);
    expect((service as any).daysInBangkokMonth(new Date("2026-02-14T10:00:00.000Z"))).toBe(28);
    expect((service as any).daysInBangkokMonth(new Date("2024-02-14T10:00:00.000Z"))).toBe(29);
    expect((service as any).daysInBangkokMonth(new Date("2026-06-14T10:00:00.000Z"))).toBe(30);
    expect((service as any).daysInBangkokMonth(new Date("2026-07-14T10:00:00.000Z"))).toBe(31);
  });

  it("treats a null sales target as a no-target dashboard state", () => {
    const service = new ZentoryService({} as any);
    expect((service as any).targetProgress(300, null)).toEqual({ target: null, current: 300, percent: null, remaining: null, reached: false });
  });

  it("calculates sales change without dividing by zero", () => {
    const service = new ZentoryService({} as any);
    expect((service as any).percentChange(0, 0)).toBe(0);
    expect((service as any).percentChange(300, 0)).toBe(100);
    expect((service as any).percentChange(300, 600)).toBe(-50);
  });

  it("counts active, paused, and discontinued products with stock toward the product limit", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: "active", status: "ACTIVE", balances: [] },
          { id: "paused", status: "PAUSED", balances: [] },
          { id: "discontinued_with_stock", status: "DISCONTINUED", balances: [{ quantity: 2 }] },
          { id: "discontinued_empty", status: "DISCONTINUED", balances: [{ quantity: 0 }] },
          { id: "archived", status: "ARCHIVED", balances: [{ quantity: 10 }] }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.getUsedProductLimit("business_1")).resolves.toBe(3);
  });

  it("blocks new products when the used SKU limit is full", async () => {
    const prisma: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: "active", status: "ACTIVE", balances: [] }]),
        create: jest.fn()
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue({ plan: { productLimit: 1 } }) },
      category: { upsert: jest.fn() },
      brand: { upsert: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createProduct(user, {
      name: "Blocked",
      sku: "BLOCKED-001",
      costPrice: 1,
      salePrice: 2,
      minStock: 0
    })).rejects.toThrow("แพ็กเกจของคุณถึงขีดจำกัดจำนวนสินค้าแล้ว กรุณาปิด/เก็บสินค้าอื่นก่อน หรืออัปเกรดแพ็กเกจ");
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("blocks archiving when product still has stock", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", balances: [{ quantity: 4 }], movements: [] }),
        update: jest.fn()
      },
      inventoryBalance: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 4 } })
      },
      auditLog: { create: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.archiveProduct(user, "product_1")).rejects.toThrow("ยังมีสต็อกเหลือ 4");
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("archives products when stock is empty", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "product_1", status: "DISCONTINUED", balances: [], movements: [] }),
        update: jest.fn().mockResolvedValue({ id: "product_1", status: "ARCHIVED" })
      },
      inventoryBalance: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } })
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService(prisma);

    await expect(service.archiveProduct(user, "product_1")).resolves.toEqual({ id: "product_1", status: "ARCHIVED" });
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ARCHIVED" } }));
  });

  it("blocks reactivating archived products when the used SKU limit is full", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "archived", status: "ARCHIVED", balances: [], movements: [] }),
        findMany: jest.fn().mockResolvedValue([{ id: "active", status: "ACTIVE", balances: [] }]),
        update: jest.fn()
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue({ plan: { productLimit: 1 } }) },
      auditLog: { create: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.reactivateProduct(user, "archived")).rejects.toThrow("แพ็กเกจของคุณถึงขีดจำกัดจำนวนสินค้าแล้ว กรุณาปิด/เก็บสินค้าอื่นก่อน หรืออัปเกรดแพ็กเกจ");
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("restores archived products to paused when the used SKU limit allows it", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "archived", status: "ARCHIVED", balances: [], movements: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: "archived", status: "PAUSED" })
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue({ plan: { productLimit: 1 } }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const service = new ZentoryService(prisma);

    await expect(service.reactivateProduct(user, "archived")).resolves.toEqual({ id: "archived", status: "PAUSED" });
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PAUSED" } }));
  });

  it("blocks reactivating discontinued empty-stock products when the used SKU limit is full", async () => {
    const prisma: any = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "discontinued", status: "DISCONTINUED", balances: [{ quantity: 0 }], movements: [] }),
        findMany: jest.fn().mockResolvedValue([{ id: "active", status: "ACTIVE", balances: [] }]),
        update: jest.fn()
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue({ plan: { productLimit: 1 } }) },
      auditLog: { create: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.reactivateProduct(user, "discontinued")).rejects.toThrow("แพ็กเกจของคุณถึงขีดจำกัดจำนวนสินค้าแล้ว กรุณาปิด/เก็บสินค้าอื่นก่อน หรืออัปเกรดแพ็กเกจ");
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("rejects stock receipts for discontinued products but allows stock adjustments", async () => {
    const receiptTx: any = {
      stockReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt_1", documentNo: "REC-TEST" }) },
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      inventoryBalance: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      stockMovement: { create: jest.fn() }
    };
    const adjustmentTx: any = {
      stockAdjustment: { create: jest.fn().mockResolvedValue({ id: "adjustment_1", documentNo: "ADJ-TEST" }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: "product_1", status: "DISCONTINUED" }) },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ quantity: 2 })
      },
      stockMovement: { create: jest.fn() }
    };
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch_1", status: "ACTIVE" }), findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn()
        .mockImplementationOnce((callback) => callback(receiptTx))
        .mockImplementationOnce((callback) => callback(adjustmentTx))
    };
    const service = new ZentoryService(prisma);

    await expect(service.receive(user, { items: [{ productId: "product_1", quantity: 1, unitCost: 10 }] })).rejects.toThrow("Product is not available for this operation");
    await expect(service.adjust(user, { productId: "product_1", quantity: -1, reason: "clear stock" })).resolves.toEqual({ id: "adjustment_1", documentNo: "ADJ-TEST" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        before: expect.objectContaining({ stockOnHand: 3 }),
        after: expect.objectContaining({ stockOnHand: 2 })
      })
    }));
  });

  it("rejects sales for products that are not active", async () => {
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch_1", status: "ACTIVE" }), findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } }) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await expect(service.createSale(user, {
      discount: 0,
      paymentMethod: "CASH",
      items: [{ productId: "paused_product", quantity: 1 }]
    })).rejects.toThrow("Invalid product paused_product");
  });

  it("uses atomic conditional stock decrement when selling products", async () => {
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: "product_1", salePrice: 25, costPrice: 10 }]),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1" })
      },
      sale: {
        create: jest.fn().mockResolvedValue({ id: "sale_1", receiptNo: "SALE-TEST", items: [] })
      },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ quantity: 0 })
      },
      stockMovement: {
        create: jest.fn()
      }
    };
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch_1", status: "ACTIVE" }), findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", branchId: "branch_1", status: "ACTIVE", branch: { id: "branch_1" } }) },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.createSale(user, {
      discount: 0,
      paymentMethod: "CASH",
      items: [{ productId: "product_1", quantity: 1 }]
    });

    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1",
        warehouseId: "warehouse_1",
        productId: "product_1",
        quantity: { gte: 1 }
      }),
      data: { quantity: { decrement: 1 } }
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "SALE_OUT", balanceBefore: 1, balanceAfter: 0 })
    }));
  });

  it("uses the active storefront warehouse when creating POS sales without an explicit warehouse", async () => {
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: "product_1", salePrice: 25, costPrice: 10 }]),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1" })
      },
      sale: {
        create: jest.fn().mockResolvedValue({ id: "sale_1", receiptNo: "SALE-TEST", items: [] })
      },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ quantity: 2 })
      },
      stockMovement: {
        create: jest.fn()
      }
    };
    const prisma: any = {
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "front_warehouse",
          branchId: "branch_1",
          type: "STORE_FRONT",
          status: "ACTIVE",
          branch: { id: "branch_1" }
        })
      },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.createSale(user, {
      discount: 0,
      paymentMethod: "CASH",
      items: [{ productId: "product_1", quantity: 1 }]
    });

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId: "branch_1", type: "STORE_FRONT", status: "ACTIVE" })
    }));
    expect(tx.sale.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ branchId: "branch_1", warehouseId: "front_warehouse" })
    }));
    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ warehouseId: "front_warehouse" })
    }));
  });

  it("falls back to the branch default warehouse for POS sales when no storefront warehouse exists", async () => {
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: "product_1", salePrice: 25, costPrice: 10 }]),
        findFirst: jest.fn().mockResolvedValue({ id: "product_1" })
      },
      sale: {
        create: jest.fn().mockResolvedValue({ id: "sale_1", receiptNo: "SALE-TEST", items: [] })
      },
      inventoryBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ quantity: 2 })
      },
      stockMovement: {
        create: jest.fn()
      }
    };
    const prisma: any = {
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
      warehouse: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: "default_warehouse",
            branchId: "branch_1",
            type: "BRANCH_WAREHOUSE",
            status: "ACTIVE",
            branch: { id: "branch_1" }
          })
      },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.createSale(user, {
      discount: 0,
      paymentMethod: "CASH",
      items: [{ productId: "product_1", quantity: 1 }]
    });

    expect(prisma.warehouse.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ branchId: "branch_1", type: "STORE_FRONT", status: "ACTIVE" })
    }));
    expect(prisma.warehouse.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ branchId: "branch_1", isDefault: true, status: "ACTIVE" })
    }));
    expect(tx.sale.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ branchId: "branch_1", warehouseId: "default_warehouse" })
    }));
  });

  it("approves a pending member request with role and permission overrides", async () => {
    const pendingMember = {
      id: "member_pending",
      businessId: "business_1",
      userId: "staff_user",
      role: "VIEWER",
      status: "PENDING",
      permissionOverrides: {},
      createdAt: new Date()
    };
    const updatedMember = {
      ...pendingMember,
      role: "CASHIER",
      status: "ACTIVE",
      permissionOverrides: { "reports.sales.read": true },
      user: { id: "staff_user", name: "Staff", email: "staff@example.com" }
    };
    const updateMember = jest.fn().mockResolvedValue(updatedMember);
    const deleteMemberBranches = jest.fn();
    const createMemberBranches = jest.fn();
    const prisma: any = {
      $transaction: jest.fn((callback) => callback({
        businessMember: {
          update: updateMember,
          findFirstOrThrow: jest.fn().mockResolvedValue({ ...updatedMember, branchAssignments: [{ branch: { id: "branch_1", name: "สาขาหลัก", status: "ACTIVE" } }] })
        },
        businessMemberBranch: {
          deleteMany: deleteMemberBranches,
          createMany: createMemberBranches
        }
      })),
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: "branch_1" }])
      },
      businessSubscription: { findUnique: jest.fn().mockResolvedValue({ plan: { userLimit: 5 } }) },
      businessMember: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(pendingMember),
        update: updateMember
      }
    };
    const service = new ZentoryService(prisma);

    const result = await service.approveMemberRequest(user, "member_pending", { role: "CASHIER", branchIds: ["branch_1"], overrides: { "reports.sales.read": true } });

    expect(prisma.businessMember.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "member_pending" },
      data: expect.objectContaining({
        status: "ACTIVE",
        role: "CASHIER"
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id: "member_pending",
      status: "ACTIVE",
      role: "CASHIER",
      effectivePermissions: expect.objectContaining({ "reports.sales.read": true })
    }));
  });

  it("rejects approving non-pending member requests", async () => {
    const prisma: any = {
      businessMember: {
        findFirst: jest.fn().mockResolvedValue({ id: "member_1", businessId: "business_1", userId: "staff_user", role: "VIEWER", status: "REJECTED" })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.approveMemberRequest(user, "member_1", { role: "VIEWER", overrides: {} })).rejects.toThrow("อนุมัติได้เฉพาะคำขอที่รออนุมัติ");
  });

  it("rejects a pending member request", async () => {
    const pendingMember = {
      id: "member_pending",
      businessId: "business_1",
      userId: "staff_user",
      role: "VIEWER",
      status: "PENDING",
      permissionOverrides: {},
      createdAt: new Date()
    };
    const prisma: any = {
      businessMember: {
        findFirst: jest.fn().mockResolvedValue(pendingMember),
        update: jest.fn().mockResolvedValue({ ...pendingMember, status: "REJECTED", user: { id: "staff_user", name: "Staff", email: "staff@example.com" } })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.rejectMemberRequest(user, "member_pending")).resolves.toEqual(expect.objectContaining({ status: "REJECTED" }));
    expect(prisma.businessMember.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "member_pending" }, data: { status: "REJECTED" } }));
  });
});

describe("ZentoryService billing renewals", () => {
  const proPlan = { id: "plan_professional", code: "PROFESSIONAL", name: "Professional", productLimit: 1500, userLimit: 6, branchLimit: 1, warehouseLimit: 2, priceMonthly: 899, isActive: true };
  const multiBranchPlan = { id: "plan_multi_branch", code: "MULTI_BRANCH", name: "Multi-Branch", productLimit: 3000, userLimit: 12, branchLimit: 2, warehouseLimit: 4, priceMonthly: 1790, isActive: true };

  it("allows repeat checkout for an active Professional account", async () => {
    const prisma: any = {
      businessSubscription: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: "sub_1", status: "ACTIVE", paymentMode: "PROMPTPAY_ONE_TIME", expiresAt: new Date(Date.now() + 86400000), plan: proPlan })
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue(proPlan)
      },
      accountPaymentRequest: {
        create: jest.fn().mockResolvedValue({
          id: "pay_1",
          reference: "ZT-TEST-PROFESSIONAL-M",
          planCode: "PROFESSIONAL",
          billingCycle: "monthly",
          amount: 899,
          currency: "THB",
          status: "PENDING",
          provider: "manual",
          providerPaymentId: null,
          checkoutUrl: null,
          paidAt: null,
          createdAt: new Date("2026-06-19T00:00:00.000Z"),
          plan: proPlan
        })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createAccountPaymentRequest(user, {
      planCode: "PROFESSIONAL",
      provider: "manual"
    })).resolves.toEqual(expect.objectContaining({ planCode: "PROFESSIONAL", amount: 899 }));

    expect(prisma.accountPaymentRequest.create).toHaveBeenCalled();
  });

  it("adds a trial when switching active PromptPay access to card subscription", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-19T00:00:00.000Z"));
    const previousSecret = process.env.STRIPE_SECRET_KEY;
    const previousPrice = process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID;
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID = "price_professional_monthly";
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cs_test_card", url: "https://checkout.stripe.test/card" })
    } as any);
    const activePromptPaySubscription = { id: "sub_1", status: "ACTIVE", paymentMode: "PROMPTPAY_ONE_TIME", expiresAt: new Date("2026-07-19T00:00:00.000Z"), stripeCustomerId: "cus_1", plan: proPlan };
    const createdPayment = {
      id: "pay_1",
      reference: "ZT-CARD-PROFESSIONAL-M",
      userId: user.userId,
      businessId: user.businessId,
      planId: "plan_professional",
      planCode: "PROFESSIONAL",
      billingCycle: "monthly",
      amount: 899,
      currency: "THB",
      status: "PENDING",
      provider: "stripe",
      providerPaymentId: null,
      checkoutUrl: null,
      paidAt: null,
      createdAt: new Date("2026-06-19T00:00:00.000Z"),
      metadata: { checkoutMode: "subscription" },
      plan: proPlan
    };
    const prisma: any = {
      businessSubscription: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(activePromptPaySubscription)
          .mockResolvedValueOnce(activePromptPaySubscription)
          .mockResolvedValueOnce(activePromptPaySubscription)
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue(proPlan)
      },
      accountPaymentRequest: {
        create: jest.fn().mockResolvedValue(createdPayment),
        update: jest.fn().mockResolvedValue({ ...createdPayment, providerPaymentId: "cs_test_card", stripeCheckoutSessionId: "cs_test_card", checkoutUrl: "https://checkout.stripe.test/card" })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createAccountPaymentRequest(user, {
      planCode: "PROFESSIONAL",
      checkoutMode: "subscription"
    })).resolves.toEqual(expect.objectContaining({ checkoutUrl: "https://checkout.stripe.test/card" }));

    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body as URLSearchParams;
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("payment_method_collection")).toBe("always");
    expect(body.get("subscription_data[trial_period_days]")).toBe("30");
    expect(body.get("customer")).toBe("cus_1");

    fetchMock.mockRestore();
    process.env.STRIPE_SECRET_KEY = previousSecret;
    process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID = previousPrice;
    jest.useRealTimers();
  });

  it("creates Stripe checkout for the paid multi-branch launch plan", async () => {
    const previousSecret = process.env.STRIPE_SECRET_KEY;
    const previousPrice = process.env.STRIPE_MULTI_BRANCH_MONTHLY_PRICE_ID;
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_MULTI_BRANCH_MONTHLY_PRICE_ID = "price_multi_branch_monthly";
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cs_multi_branch", url: "https://checkout.stripe.test/multi-branch" })
    } as any);
    const createdPayment = {
      id: "pay_1",
      reference: "ZT-MULTI-M",
      userId: user.userId,
      businessId: user.businessId,
      planId: "plan_multi_branch",
      planCode: "MULTI_BRANCH",
      billingCycle: "monthly",
      amount: 1790,
      currency: "THB",
      status: "PENDING",
      provider: "stripe",
      providerPaymentId: null,
      checkoutUrl: null,
      paidAt: null,
      createdAt: new Date("2026-06-19T00:00:00.000Z"),
      metadata: { checkoutMode: "subscription" },
      plan: multiBranchPlan
    };
    const prisma: any = {
      businessSubscription: {
        findUnique: jest.fn().mockResolvedValue(null)
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue(multiBranchPlan)
      },
      accountPaymentRequest: {
        create: jest.fn().mockResolvedValue(createdPayment),
        update: jest.fn().mockResolvedValue({ ...createdPayment, providerPaymentId: "cs_multi_branch", stripeCheckoutSessionId: "cs_multi_branch", checkoutUrl: "https://checkout.stripe.test/multi-branch" })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.createAccountPaymentRequest(user, {
      planCode: "MULTI_BRANCH",
      checkoutMode: "subscription"
    })).resolves.toEqual(expect.objectContaining({ amount: 1790, checkoutUrl: "https://checkout.stripe.test/multi-branch" }));

    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body as URLSearchParams;
    expect(body.get("line_items[0][price]")).toBe("price_multi_branch_monthly");
    expect(body.get("metadata[planCode]")).toBe("MULTI_BRANCH");
    expect(body.get("success_url")).toBe("http://localhost:5173/checkout/success?plan=multi_branch&method=subscription&reference=ZT-MULTI-M&session_id={CHECKOUT_SESSION_ID}");

    fetchMock.mockRestore();
    process.env.STRIPE_SECRET_KEY = previousSecret;
    process.env.STRIPE_MULTI_BRANCH_MONTHLY_PRICE_ID = previousPrice;
  });

  it("extends PromptPay access from the current expiry when paying the same plan again", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-19T00:00:00.000Z"));
    const currentExpiry = new Date("2026-07-01T00:00:00.000Z");
    const expectedExpiry = new Date("2026-07-31T00:00:00.000Z");
    const payment = {
      id: "pay_1",
      reference: "ZT-RENEW-PROFESSIONAL-M",
      userId: "user_1",
      businessId: "business_1",
      planId: "plan_professional",
      planCode: "PROFESSIONAL",
      billingCycle: "monthly",
      checkoutMode: "promptpay",
      amount: 899,
      currency: "THB",
      status: "PENDING",
      provider: "stripe_promptpay",
      providerPaymentId: "cs_test_renew",
      stripeCheckoutSessionId: "cs_test_renew",
      stripePaymentIntentId: null,
      failureReason: null,
      checkoutUrl: "https://checkout.stripe.test/session",
      paidAt: null,
      metadata: { checkoutMode: "promptpay" },
      plan: proPlan
    };
    const prisma: any = {
      accountPaymentRequest: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn()
      },
      businessSubscription: {
        findUnique: jest.fn().mockResolvedValue({ id: "sub_1", status: "ACTIVE", paymentMode: "PROMPTPAY_ONE_TIME", expiresAt: currentExpiry, plan: proPlan }),
        upsert: jest.fn()
      },
      auditLog: {
        create: jest.fn()
      },
      $transaction: jest.fn(async (callback) => callback(prisma))
    };
    prisma.accountPaymentRequest.update.mockResolvedValue({
      ...payment,
      status: "PAID",
      paidAt: new Date("2026-06-19T00:00:00.000Z")
    });
    const service = new ZentoryService(prisma);

    await expect(service.handlePaymentWebhook({
      reference: "ZT-RENEW-PROFESSIONAL-M",
      status: "PAID",
      provider: "stripe_promptpay",
      providerPaymentId: "cs_test_renew",
      amount: 899,
      currency: "THB",
      metadata: { checkoutMode: "promptpay", stripeCheckoutSessionId: "cs_test_renew" }
    })).resolves.toEqual(expect.objectContaining({ status: "PAID" }));

    expect(prisma.businessSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        expiresAt: expectedExpiry,
        currentPeriodEnd: expectedExpiry
      })
    }));
    expect(prisma.auditLog.create).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("confirms returned Stripe checkout and upgrades Professional to Multi-Branch before webhook delivery", async () => {
    const previousSecret = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    const fetchMock = jest.spyOn(global, "fetch" as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "cs_multi_branch",
          client_reference_id: "ZT-UPGRADE-MULTI-M",
          payment_status: "paid",
          subscription: "sub_multi_branch",
          customer: "cus_1",
          metadata: {
            reference: "ZT-UPGRADE-MULTI-M",
            checkoutMode: "subscription",
            planCode: "MULTI_BRANCH",
            businessId: "business_1"
          }
        })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub_multi_branch",
          customer: "cus_1",
          status: "active",
          current_period_start: 1781827200,
          current_period_end: 1784419200,
          cancel_at_period_end: false
        })
      } as any);
    const payment = {
      id: "pay_1",
      reference: "ZT-UPGRADE-MULTI-M",
      userId: "user_1",
      businessId: "business_1",
      planId: "plan_multi_branch",
      planCode: "MULTI_BRANCH",
      billingCycle: "monthly",
      checkoutMode: "subscription",
      amount: 1790,
      currency: "THB",
      status: "PENDING",
      provider: "stripe",
      providerPaymentId: "cs_multi_branch",
      stripeCheckoutSessionId: "cs_multi_branch",
      stripePaymentIntentId: null,
      failureReason: null,
      checkoutUrl: "https://checkout.stripe.test/multi-branch",
      paidAt: null,
      metadata: { checkoutMode: "subscription" },
      plan: multiBranchPlan
    };
    const prisma: any = {
      accountPaymentRequest: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn()
      },
      businessSubscription: {
        findUnique: jest.fn().mockResolvedValue({ id: "sub_1", status: "ACTIVE", paymentMode: "STRIPE_SUBSCRIPTION", plan: proPlan, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_professional" }),
        upsert: jest.fn()
      },
      auditLog: {
        create: jest.fn()
      },
      $transaction: jest.fn(async (callback) => callback(prisma))
    };
    prisma.accountPaymentRequest.update.mockResolvedValue({
      ...payment,
      status: "PAID",
      paidAt: new Date("2026-06-19T00:00:00.000Z")
    });
    const service = new ZentoryService(prisma);

    await expect(service.confirmStripeCheckoutSession(user, {
      sessionId: "cs_multi_branch",
      reference: "ZT-UPGRADE-MULTI-M"
    })).resolves.toEqual(expect.objectContaining({ status: "PAID" }));

    expect(prisma.businessSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        planId: "plan_multi_branch",
        paymentMode: "STRIPE_SUBSCRIPTION",
        stripeSubscriptionId: "sub_multi_branch"
      })
    }));

    fetchMock.mockRestore();
    process.env.STRIPE_SECRET_KEY = previousSecret;
  });

  it("normalizes legacy admin plan codes before assigning subscriptions", async () => {
    const prisma: any = {
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue(proPlan)
      },
      businessSubscription: {
        upsert: jest.fn().mockResolvedValue({ id: "sub_1", planId: proPlan.id })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateSubscription({ ...user, isSystemAdmin: true }, "business_1", "PRO")).resolves.toEqual(expect.objectContaining({ planId: proPlan.id }));

    expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({ where: { code: "PROFESSIONAL" } });
    expect(prisma.businessSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ planId: proPlan.id })
    }));
  });

  it("rejects unknown admin plan codes", async () => {
    const prisma: any = {
      subscriptionPlan: { findUnique: jest.fn() },
      businessSubscription: { upsert: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateSubscription({ ...user, isSystemAdmin: true }, "business_1", "ENTERPRISE")).rejects.toThrow("แพ็กเกจนี้ไม่พร้อมใช้งาน");
    expect(prisma.subscriptionPlan.findUnique).not.toHaveBeenCalled();
    expect(prisma.businessSubscription.upsert).not.toHaveBeenCalled();
  });
});

describe("ZentoryService stock counts", () => {
  it("creates a stock count from warehouse balances with system quantity snapshots", async () => {
    const tx: any = {
      stockCount: { create: jest.fn().mockResolvedValue({ id: "count_1" }) },
      stockCountItem: { createMany: jest.fn().mockResolvedValue({ count: 2 }) }
    };
    const prisma: any = {
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "warehouse_1", businessId: "business_1", branchId: "branch_1", status: "ACTIVE" }) },
      inventoryBalance: {
        findMany: jest.fn().mockResolvedValue([
          { productId: "product_b", quantity: 3, product: { id: "product_b", name: "สินค้า B", category: { name: "หมวด" }, brand: null } },
          { productId: "product_a", quantity: 7, product: { id: "product_a", name: "สินค้า A", category: { name: "หมวด" }, brand: null } }
        ])
      },
      stockCount: {
        findFirst: jest.fn().mockResolvedValue({
          id: "count_1",
          documentNo: "CNT-TEST",
          status: "COUNTING",
          items: [],
          warehouse: {},
          user: { name: "Owner" }
        })
      },
      $transaction: jest.fn((callback) => callback(tx))
    };
    const service = new ZentoryService(prisma);

    await service.createStockCount(user, { warehouseId: "warehouse_1" });

    expect(tx.stockCount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessId: "business_1", warehouseId: "warehouse_1", userId: "user_1" })
    }));
    expect(tx.stockCountItem.createMany).toHaveBeenCalledWith({
      data: [
        { stockCountId: "count_1", productId: "product_a", systemQuantity: 7 },
        { stockCountId: "count_1", productId: "product_b", systemQuantity: 3 }
      ]
    });
  });

  it("rejects applying a stock count while any item is uncounted", async () => {
    const tx: any = {
      stockCount: {
        findFirst: jest.fn().mockResolvedValue({
          id: "count_1",
          status: "REVIEW",
          items: [{ productId: "product_1", countedQuantity: null, difference: null }]
        })
      }
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new ZentoryService(prisma);

    await expect(service.applyStockCount(user, "count_1")).rejects.toThrow("กรุณากรอกยอดนับจริงให้ครบก่อนปรับสต็อก");
  });

  it("rejects applying the same stock count twice", async () => {
    const tx: any = {
      stockCount: {
        findFirst: jest.fn().mockResolvedValue({
          id: "count_1",
          status: "APPLIED",
          items: []
        })
      }
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new ZentoryService(prisma);

    await expect(service.applyStockCount(user, "count_1")).rejects.toThrow("รอบนับนี้ปรับสต็อกไปแล้ว");
  });

  it("rejects canceling an applied stock count", async () => {
    const prisma: any = {
      stockCount: {
        findFirst: jest.fn().mockResolvedValue({ id: "count_1", status: "APPLIED" }),
        update: jest.fn()
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.cancelStockCount(user, "count_1")).rejects.toThrow("ยกเลิกรอบนับที่ปรับสต็อกแล้วไม่ได้");
  });
});

describe("ZentoryService member branch access", () => {
  const staffUser = {
    userId: "staff_1",
    businessId: "business_1",
    role: "CASHIER",
    email: "staff@example.com",
    isSystemAdmin: false,
    assignedBranchIds: ["branch_allowed"]
  };

  it("includes owner accounts as read-only context in the staff list", async () => {
    const prisma: any = {
      businessMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "owner_member",
            businessId: "business_1",
            role: "OWNER",
            status: "ACTIVE",
            permissionOverrides: {},
            branchAssignments: [],
            user: { id: "owner_1", name: "Owner", email: "owner@example.com" }
          }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.members(user)).resolves.toEqual([expect.objectContaining({ id: "owner_member", role: "OWNER" })]);
    expect(prisma.businessMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business_1" }
    }));
  });

  it("limits staff lists to members assigned to the user's branches", async () => {
    const prisma: any = {
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: "branch_allowed", name: "หน้าร้าน", code: "FRONT", status: "ACTIVE" }])
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "member_allowed",
            businessId: "business_1",
            role: "CASHIER",
            status: "ACTIVE",
            permissionOverrides: {},
            branchAssignments: [{ branchId: "branch_allowed", branch: { id: "branch_allowed", name: "หน้าร้าน" } }]
          },
          {
            id: "member_other",
            businessId: "business_1",
            role: "CASHIER",
            status: "ACTIVE",
            permissionOverrides: {},
            branchAssignments: [{ branchId: "branch_other", branch: { id: "branch_other", name: "สาขาอื่น" } }]
          },
          {
            id: "pending_allowed",
            businessId: "business_1",
            role: "VIEWER",
            status: "PENDING",
            preferredBranch: "FRONT",
            permissionOverrides: {},
            branchAssignments: []
          },
          {
            id: "pending_other",
            businessId: "business_1",
            role: "VIEWER",
            status: "PENDING",
            preferredBranch: "สาขาอื่น",
            permissionOverrides: {},
            branchAssignments: []
          },
          {
            id: "pending_unspecified",
            businessId: "business_1",
            role: "VIEWER",
            status: "PENDING",
            preferredBranch: null,
            permissionOverrides: {},
            branchAssignments: []
          }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    const result = await service.members(staffUser);

    expect(result.map((member: any) => member.id)).toEqual(["member_allowed", "pending_allowed"]);
  });

  it("filters owner staff lists by the selected branch", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_selected", businessId: "business_1", name: "สาขาที่เลือก", code: "SELECTED", status: "ACTIVE" }),
        findMany: jest.fn().mockResolvedValue([{ id: "branch_selected", name: "สาขาที่เลือก", code: "SELECTED", status: "ACTIVE" }])
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "member_selected",
            businessId: "business_1",
            role: "CASHIER",
            status: "ACTIVE",
            permissionOverrides: {},
            branchAssignments: [{ branchId: "branch_selected", branch: { id: "branch_selected", name: "สาขาที่เลือก" } }]
          },
          {
            id: "member_other",
            businessId: "business_1",
            role: "CASHIER",
            status: "ACTIVE",
            permissionOverrides: {},
            branchAssignments: [{ branchId: "branch_other", branch: { id: "branch_other", name: "สาขาอื่น" } }]
          },
          {
            id: "pending_selected",
            businessId: "business_1",
            role: "VIEWER",
            status: "PENDING",
            preferredBranch: "SELECTED",
            permissionOverrides: {},
            branchAssignments: []
          }
        ])
      }
    };
    const service = new ZentoryService(prisma);

    const result = await service.members(user, "branch_selected");

    expect(result.map((member: any) => member.id)).toEqual(["member_selected", "pending_selected"]);
  });

  it("limits branch lists to assigned branches for non-owner users", async () => {
    const prisma: any = {
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: "branch_allowed", name: "หน้าร้าน", status: "ACTIVE" }])
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.listBranches(staffUser)).resolves.toEqual([expect.objectContaining({ id: "branch_allowed" })]);
    expect(prisma.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business_1",
        id: { in: ["branch_allowed"] }
      })
    }));
  });

  it("rejects warehouse access outside the assigned branch", async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "warehouse_other",
          businessId: "business_1",
          branchId: "branch_other",
          status: "ACTIVE",
          branch: { id: "branch_other", status: "ACTIVE" }
        })
      },
      inventoryBalance: { findMany: jest.fn() }
    };
    const service = new ZentoryService(prisma);

    await expect(service.balances(staffUser, { warehouseId: "warehouse_other" })).rejects.toThrow("Branch is not assigned to this user");
    expect(prisma.inventoryBalance.findMany).not.toHaveBeenCalled();
  });

  it("expires an overdue paid plan before enforcing plan-locked warehouse writes", async () => {
    const starterPlan = { id: "plan_starter", code: "STARTER", name: "Starter", productLimit: 200, userLimit: 2, branchLimit: 1, warehouseLimit: 1 };
    const expiredProfessional = {
      id: "sub_1",
      businessId: "business_1",
      plan: { code: "PROFESSIONAL", name: "Professional", productLimit: 1500, userLimit: 6, branchLimit: 1, warehouseLimit: 2 },
      paymentMode: "PROMPTPAY_ONE_TIME",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 1500),
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeSubscriptionId: null
    };
    const limitedStarter = {
      ...expiredProfessional,
      plan: starterPlan,
      planId: starterPlan.id,
      paymentMode: "FREE",
      status: "LIMITED",
      expiresAt: null
    };
    const prisma: any = {
      subscriptionPlan: { findUniqueOrThrow: jest.fn().mockResolvedValue(starterPlan) },
      businessSubscription: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(expiredProfessional)
          .mockResolvedValueOnce(limitedStarter),
        update: jest.fn().mockResolvedValue(limitedStarter)
      },
      branch: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          { id: "branch_main", status: "ACTIVE", isDefault: true, createdAt: new Date("2026-01-01") },
          { id: "branch_locked", status: "ACTIVE", isDefault: false, createdAt: new Date("2026-01-02") }
        ])
      },
      warehouse: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          { id: "warehouse_main", branchId: "branch_main", status: "ACTIVE", isDefault: true, createdAt: new Date("2026-01-01") },
          { id: "warehouse_locked", branchId: "branch_locked", status: "ACTIVE", isDefault: false, createdAt: new Date("2026-01-02") }
        ])
      },
      businessMember: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: "member_owner", role: "OWNER", status: "ACTIVE" }])
      },
      product: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const service = new ZentoryService(prisma);

    await expect((service as any).assertPlanWarehouseWriteAccess("business_1", "warehouse_locked")).rejects.toThrow("คลังนี้ถูกจำกัดตามแพ็กเกจ");
    expect(prisma.businessSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business_1" },
      data: expect.objectContaining({ planId: starterPlan.id, status: "LIMITED", paymentMode: "FREE" })
    }));
  });

  it("enforces active plan limits when a migrated business has more branches or warehouses than the plan allows", async () => {
    const professionalPlan = { code: "PROFESSIONAL", name: "Professional", productLimit: 1500, userLimit: 6, branchLimit: 1, warehouseLimit: 2 };
    const activeProfessional = {
      id: "sub_1",
      businessId: "business_1",
      plan: professionalPlan,
      paymentMode: "FREE",
      status: "ACTIVE",
      expiresAt: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeSubscriptionId: null
    };
    const prisma: any = {
      businessSubscription: {
        findUnique: jest.fn().mockResolvedValue(activeProfessional),
        update: jest.fn()
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([
          { id: "branch_main", status: "ACTIVE", isDefault: true, createdAt: new Date("2026-01-01") },
          { id: "branch_locked", status: "ACTIVE", isDefault: false, createdAt: new Date("2026-01-02") }
        ])
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([
          { id: "warehouse_main", branchId: "branch_main", status: "ACTIVE", isDefault: true, createdAt: new Date("2026-01-01") },
          { id: "warehouse_second", branchId: "branch_main", status: "ACTIVE", isDefault: false, createdAt: new Date("2026-01-02") },
          { id: "warehouse_locked", branchId: "branch_locked", status: "ACTIVE", isDefault: false, createdAt: new Date("2026-01-03") }
        ])
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue([{ id: "member_owner", role: "OWNER", status: "ACTIVE" }])
      },
      product: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const service = new ZentoryService(prisma);

    await expect((service as any).assertPlanWarehouseWriteAccess("business_1", "warehouse_locked")).rejects.toThrow("คลังนี้ถูกจำกัดตามแพ็กเกจ");
    expect(prisma.businessSubscription.update).not.toHaveBeenCalled();
  });
});
