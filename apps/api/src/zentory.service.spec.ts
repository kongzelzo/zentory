import { ZentoryService } from "./zentory.service";
import { ProductImageStorageService } from "./products/product-image-storage.service";

const user = { userId: "user_1", businessId: "business_1", role: "OWNER", email: "owner@example.com", isSystemAdmin: false };

describe("ZentoryService Phase 1 inventory behavior", () => {
  it("creates branches with warehouse metadata", async () => {
    const prisma: any = {
      businessSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      branch: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({
          id: "branch_2",
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

    await expect(service.createBranch(user, {
      name: "Warehouse Bangkok",
      code: "wh-bkk",
      type: "SECONDARY_WAREHOUSE",
      status: "ACTIVE",
      address: "Zone A",
      contactName: "Somchai",
      contactPhone: "0800000000",
      note: "Cold room"
    })).resolves.toEqual(expect.objectContaining({ code: "WH-BKK", type: "SECONDARY_WAREHOUSE", note: "Cold room" }));

    expect(prisma.branch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "business_1",
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

  it("updates branch metadata and rejects duplicate branch codes", async () => {
    const prisma: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_2", businessId: "business_1", name: "Old", code: "OLD", status: "ACTIVE", isDefault: false }),
        update: jest.fn()
          .mockResolvedValueOnce({ id: "branch_2", name: "New", code: "STORE-01" })
          .mockRejectedValueOnce({ code: "P2002", meta: { target: ["businessId", "code"] } })
      }
    };
    const service = new ZentoryService(prisma);

    await expect(service.updateBranch(user, "branch_2", {
      name: "New",
      code: "store-01",
      type: "STORE_FRONT",
      status: "ACTIVE",
      address: "Front",
      contactName: "Owner",
      contactPhone: "0811111111",
      note: "Main counter"
    })).resolves.toEqual(expect.objectContaining({ code: "STORE-01" }));

    expect(prisma.branch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: "STORE-01", type: "STORE_FRONT", address: "Front" })
    }));

    await expect(service.updateBranch(user, "branch_2", { code: "MAIN" })).rejects.toThrow("รหัสคลังนี้ถูกใช้แล้ว");
  });

  it("blocks disabling the default branch when it has stock or is the last active branch", async () => {
    const prismaWithStock: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_1", businessId: "business_1", name: "Main", code: "MAIN", status: "ACTIVE", isDefault: true }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn()
      },
      inventoryBalance: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 3 } })
      }
    };
    const serviceWithStock = new ZentoryService(prismaWithStock);

    await expect(serviceWithStock.updateBranch(user, "branch_1", { status: "INACTIVE" })).rejects.toThrow("ไม่สามารถปิดใช้งานคลังหลักที่ยังมีสต็อกอยู่");
    expect(prismaWithStock.branch.update).not.toHaveBeenCalled();

    const prismaLastActive: any = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_1", businessId: "business_1", name: "Main", code: "MAIN", status: "ACTIVE", isDefault: true }),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn()
      },
      inventoryBalance: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } })
      }
    };
    const serviceLastActive = new ZentoryService(prismaLastActive);

    await expect(serviceLastActive.updateBranch(user, "branch_1", { status: "INACTIVE" })).rejects.toThrow("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลัง");
    expect(prismaLastActive.branch.update).not.toHaveBeenCalled();
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
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: "branch_1" })
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
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
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
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
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
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
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
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
      $transaction: jest.fn()
        .mockImplementationOnce((callback) => callback(receiptTx))
        .mockImplementationOnce((callback) => callback(adjustmentTx))
    };
    const service = new ZentoryService(prisma);

    await expect(service.receive(user, { items: [{ productId: "product_1", quantity: 1, unitCost: 10 }] })).rejects.toThrow("Product is not available for this operation");
    await expect(service.adjust(user, { productId: "product_1", quantity: -1, reason: "clear stock" })).resolves.toEqual({ id: "adjustment_1", documentNo: "ADJ-TEST" });
  });

  it("rejects sales for products that are not active", async () => {
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const prisma: any = {
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
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
      branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: "branch_1" }) },
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
        branchId: "branch_1",
        productId: "product_1",
        quantity: { gte: 1 }
      }),
      data: { quantity: { decrement: 1 } }
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "SALE_OUT", balanceBefore: 1, balanceAfter: 0 })
    }));
  });
});
