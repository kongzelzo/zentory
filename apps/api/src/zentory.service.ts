import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, RoleName } from "@prisma/client";
import { hasPermission, normalizePermissionOverrides, resolveEffectivePermissions, type Role } from "@zentory/shared";
import { randomUUID } from "crypto";
import { AdjustmentDto, BranchDto, BusinessDto, CategoryDto, CheckoutPaymentDto, DashboardGoalsDto, MemberApprovalDto, PaymentWebhookDto, ProductDto, ProductVariantsDto, ReceiptDto, ReceiptNewProductDto, SaleDto, SaleListQueryDto, StockCountCreateDto, StockCountItemsUpdateDto, TransferDto, WarehouseDto } from "./common/dto";
import { CurrentUser } from "./common/current-user.decorator";
import { NotificationService } from "./notifications/notification.service";
import { PrismaService } from "./prisma/prisma.service";
import { ProductImageFile, ProductImageStorageService } from "./products/product-image-storage.service";

const PRODUCT_LIMIT_ERROR = "แพ็กเกจของคุณถึงขีดจำกัดจำนวนสินค้าแล้ว กรุณาปิด/เก็บสินค้าอื่นก่อน หรืออัปเกรดแพ็กเกจ";
const PRODUCT_MANAGEMENT_STATUSES = ["ACTIVE", "PAUSED", "DISCONTINUED"] as const;
const PRODUCT_STOCK_RECEIPT_STATUSES = ["ACTIVE", "PAUSED"] as const;
const PRODUCT_STOCK_ADJUSTMENT_STATUSES = ["ACTIVE", "PAUSED", "DISCONTINUED"] as const;
const BRANCH_CODE_DUPLICATE_ERROR = "รหัสสาขานี้ถูกใช้แล้ว";
const WAREHOUSE_CODE_DUPLICATE_ERROR = "รหัสคลังนี้ถูกใช้แล้ว";
const WAREHOUSE_TYPES = ["MAIN_WAREHOUSE", "STORE_FRONT", "BRANCH_WAREHOUSE", "SECONDARY_WAREHOUSE"] as const;
const BRANCH_STATUSES = ["ACTIVE", "INACTIVE"] as const;
const WAREHOUSE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const PROMPTPAY_ACCESS_DAYS = 30;
const PLAN_CODE_RANK: Record<string, number> = { FREE: 0, PRO: 10, PREMIUM: 20 };
type LocationFilters = { branchId?: string; warehouseId?: string };
type StockPlanningReason = "OUT" | "LOW" | "FAST_MOVING" | "HEALTHY";
type CheckoutMode = "subscription" | "promptpay";
const noopNotificationHooks = {
  createTransferRequestNotification: async () => undefined,
  createTransferReceiveNotification: async () => undefined,
  createTransferStatusNotification: async () => undefined,
  refreshStockAlertsForProducts: async () => undefined,
  resolveStaffRequestNotification: async () => undefined,
  createStockCountReviewNotification: async () => undefined,
  resolveStockCountReviewNotification: async () => undefined
} as unknown as NotificationService;
type ScopedLocation = {
  branchIds?: string[];
  branchId?: string;
  warehouseId?: string;
  branchWhere: Prisma.BranchWhereInput;
  warehouseWhere: Prisma.WarehouseWhereInput;
  inventoryBalanceWhere: Prisma.InventoryBalanceWhereInput;
  stockMovementWhere: Prisma.StockMovementWhereInput;
  productWhere: Prisma.ProductWhereInput;
  saleWhere: Prisma.SaleWhereInput;
  transferWhere: Prisma.StockTransferWhereInput;
};

@Injectable()
export class ZentoryService {
  private readonly logger = new Logger(ZentoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productImageStorage: ProductImageStorageService = new ProductImageStorageService(),
    @Optional() private readonly notifications: NotificationService = noopNotificationHooks
  ) {}

  async currentBusiness(user: CurrentUser) {
    this.requireBusiness(user);
    await this.expirePromptPaySubscriptionIfNeeded(user.businessId!);
    const scope = await this.scopedLocation(user);
    return this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
      include: { subscription: { include: { plan: true } }, branches: { where: scope.branchWhere } }
    });
  }

  async listBranches(user: CurrentUser) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user);
    return this.prisma.branch.findMany({
      where: { businessId: user.businessId, ...scope.branchWhere },
      include: { warehouses: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });
  }

  async getBranch(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    await this.assertBranchAccess(user, id);
    const branch = await this.prisma.branch.findFirst({
      where: { id, businessId: user.businessId },
      include: { warehouses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }, sales: { take: 20, orderBy: { createdAt: "desc" } } }
    });
    if (!branch) throw new NotFoundException("Branch not found");
    return branch;
  }

  async createBranch(user: CurrentUser, dto: BranchDto) {
    this.requireBusiness(user);
    const data = this.branchWriteData(dto);
    if (!data.name) throw new BadRequestException("Branch name is required");
    if (!data.code) throw new BadRequestException("Branch code is required");
    await this.enforceBranchLimit(user.businessId!);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.create({
          data: {
            businessId: user.businessId!,
            name: data.name as string,
            code: data.code as string,
            status: (data.status ?? "ACTIVE") as any,
            address: data.address,
            contactName: data.contactName,
            contactPhone: data.contactPhone,
            note: data.note
          }
        });
        await this.ensureBranchDefaultWarehouse(tx, user.businessId!, branch);
        return branch;
      });
    } catch (error) {
      this.handleBranchWriteError(error);
    }
  }

  async updateBranch(user: CurrentUser, id: string, dto: Partial<BranchDto>) {
    this.requireBusiness(user);
    const branch = await this.assertBranchAccess(user, id);
    const data = this.branchWriteData(dto);
    if (dto.name !== undefined && !data.name) throw new BadRequestException("Branch name is required");
    if (dto.code !== undefined && !data.code) throw new BadRequestException("Branch code is required");
    if (data.status === "INACTIVE") await this.assertCanDeactivateBranch(user.businessId!, branch);
    try {
      return await this.prisma.branch.update({
        where: { id },
        data: data as any
      });
    } catch (error) {
      this.handleBranchWriteError(error);
    }
  }

  async listWarehouses(user: CurrentUser, branchId?: string, options: { scope?: string } = {}) {
    this.requireBusiness(user);
    const showBusinessWarehouses = options.scope === "business" && !branchId;
    if (showBusinessWarehouses) await this.ensureMissingBranchDefaultWarehouses(user.businessId!);
    const scope = showBusinessWarehouses ? undefined : await this.scopedLocation(user, { branchId });
    return this.prisma.warehouse.findMany({
      where: { businessId: user.businessId, ...(scope?.warehouseWhere ?? {}) },
      include: {
        branch: true,
        balances: { where: { product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } }, include: { product: true } },
        movements: { take: 10, orderBy: { createdAt: "desc" }, include: { product: true, user: { select: { id: true, name: true } } } }
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });
  }

  async getWarehouse(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        branch: true,
        balances: { where: { product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } }, include: { product: true }, orderBy: { updatedAt: "desc" } },
        movements: { take: 50, orderBy: { createdAt: "desc" }, include: { product: true, user: { select: { id: true, name: true } } } }
      }
    });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    await this.assertBranchAccess(user, warehouse.branchId);
    const products = await (this.prisma.product as any).findMany({
      where: { businessId: user.businessId, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } },
      orderBy: { name: "asc" }
    });
    const balancesByProductId = new Map(warehouse.balances.map((balance) => [balance.productId, balance]));
    const balances = products.map((product: any) => balancesByProductId.get(product.id) ?? {
      businessId: user.businessId!,
      warehouseId: warehouse.id,
      productId: product.id,
      quantity: 0,
      product
    });
    return { ...warehouse, balances };
  }

  async createWarehouse(user: CurrentUser, dto: WarehouseDto) {
    this.requireBusiness(user);
    const data = this.warehouseWriteData(dto);
    if (!data.name) throw new BadRequestException("Warehouse name is required");
    if (!data.code) throw new BadRequestException("Warehouse code is required");
    await this.enforceWarehouseLimit(user.businessId!);
    const branch = await this.assertBranchAccess(user, dto.branchId);
    try {
      return await this.prisma.warehouse.create({
        data: {
          businessId: user.businessId!,
          branchId: branch.id,
          name: data.name as string,
          code: data.code as string,
          type: (data.type ?? "BRANCH_WAREHOUSE") as any,
          status: (data.status ?? "ACTIVE") as any,
          address: data.address,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          note: data.note
        }
      });
    } catch (error) {
      this.handleWarehouseWriteError(error);
    }
  }

  async updateWarehouse(user: CurrentUser, id: string, dto: Partial<WarehouseDto>) {
    this.requireBusiness(user);
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, businessId: user.businessId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    const data = this.warehouseWriteData(dto);
    if (dto.name !== undefined && !data.name) throw new BadRequestException("Warehouse name is required");
    if (dto.code !== undefined && !data.code) throw new BadRequestException("Warehouse code is required");
    if (dto.branchId !== undefined) await this.assertBranchAccess(user, dto.branchId);
    if (data.status === "INACTIVE") await this.assertCanDeactivateWarehouse(user.businessId!, warehouse);
    try {
      return await this.prisma.warehouse.update({
        where: { id },
        data: data as any
      });
    } catch (error) {
      this.handleWarehouseWriteError(error);
    }
  }

  async deleteWarehouse(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        _count: {
          select: {
            balances: true,
            movements: true,
            receipts: true,
            adjustments: true,
            sales: true
          }
        }
      }
    });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    await this.assertCanDeleteWarehouse(user.businessId!, warehouse);
    return this.prisma.warehouse.delete({ where: { id } });
  }

  async listCategories(user: CurrentUser, branchId?: string) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, { branchId });
    return this.prisma.category.findMany({
      where: { businessId: user.businessId },
      include: {
        _count: { select: { products: true } },
        products: {
          where: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } },
          select: {
            id: true,
            name: true,
            sku: true,
            imagePath: true,
            unit: true,
            balances: {
              where: Object.keys(scope.inventoryBalanceWhere).length ? scope.inventoryBalanceWhere : undefined,
              select: { quantity: true }
            }
          },
          orderBy: { name: "asc" },
          take: 5
        }
      },
      orderBy: { name: "asc" }
    });
  }

  async createCategory(user: CurrentUser, dto: CategoryDto) {
    this.requireBusiness(user);
    const data = this.categoryWriteData(dto);
    if (!data.name) throw new BadRequestException("Category name is required");
    try {
      return await this.prisma.category.create({
        data: { businessId: user.businessId!, name: data.name, color: data.color },
        include: { _count: { select: { products: true } } }
      });
    } catch (error) {
      this.handleCategoryWriteError(error);
    }
  }

  async updateCategory(user: CurrentUser, id: string, dto: Partial<CategoryDto>) {
    this.requireBusiness(user);
    const category = await this.prisma.category.findFirst({ where: { id, businessId: user.businessId } });
    if (!category) throw new NotFoundException("Category not found");
    const data = this.categoryWriteData(dto);
    if (dto.name !== undefined && !data.name) throw new BadRequestException("Category name is required");
    try {
      return await this.prisma.category.update({
        where: { id },
        data,
        include: { _count: { select: { products: true } } }
      });
    } catch (error) {
      this.handleCategoryWriteError(error);
    }
  }

  async deleteCategory(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const category = await this.prisma.category.findFirst({
      where: { id, businessId: user.businessId },
      include: { _count: { select: { products: true } } }
    });
    if (!category) throw new NotFoundException("Category not found");
    if (category._count.products > 0) throw new BadRequestException("หมวดหมู่นี้ยังมีสินค้าใช้งานอยู่ กรุณาย้ายสินค้าออกก่อนลบ");
    return this.prisma.category.delete({ where: { id } });
  }

  async updateBusiness(user: CurrentUser, dto: Partial<BusinessDto>) {
    this.requireBusiness(user);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.province !== undefined) data.province = this.optionalText(dto.province);
    if (dto.businessType !== undefined) data.businessType = this.optionalText(dto.businessType);
    if (dto.branchCount !== undefined) data.branchCount = dto.branchCount.trim() || "1";
    if (dto.address !== undefined) data.address = this.optionalText(dto.address);
    if (dto.phone !== undefined) data.phone = this.optionalText(dto.phone);
    if (dto.email !== undefined) data.email = this.optionalText(dto.email);
    if (dto.taxId !== undefined) data.taxId = this.optionalText(dto.taxId);
    if (dto.logoUrl !== undefined) data.logoUrl = this.optionalText(dto.logoUrl);
    if (dto.receiptFooter !== undefined) data.receiptFooter = this.optionalText(dto.receiptFooter);
    if (dto.currency !== undefined) data.currency = dto.currency.trim().toUpperCase() || "THB";
    if (dto.taxRate !== undefined) data.taxRate = dto.taxRate;
    return this.prisma.business.update({
      where: { id: user.businessId },
      data
    });
  }

  async updateDashboardGoals(user: CurrentUser, dto: DashboardGoalsDto) {
    this.requireBusiness(user);
    return this.prisma.business.update({
      where: { id: user.businessId },
      data: {
        ...(dto.salesTargetMode !== undefined ? { salesTargetMode: dto.salesTargetMode } : {}),
        ...(dto.annualSalesTarget !== undefined ? { annualSalesTarget: dto.annualSalesTarget } : {}),
        ...(dto.dailySalesTarget !== undefined ? { dailySalesTarget: dto.dailySalesTarget } : {}),
        ...(dto.monthlySalesTarget !== undefined ? { monthlySalesTarget: dto.monthlySalesTarget } : {})
      }
    });
  }

  async onboardingStatus(user: CurrentUser) {
    this.requireBusiness(user);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
      select: {
        id: true,
        name: true,
        province: true,
        businessType: true,
        onboardingCompleted: true,
        onboardingProgress: true
      }
    });
    const [productCount, stockInCount, saleCount] = await Promise.all([
      this.getUsedProductLimit(user.businessId!),
      this.prisma.stockMovement.count({ where: { businessId: user.businessId, type: "RECEIVE_IN" } }),
      this.prisma.sale.count({ where: { businessId: user.businessId, status: "PAID" } })
    ]);
    const savedProgress = this.normalizeProgress(business.onboardingProgress);
    const steps = {
      setupStore: Boolean(business.name && business.province && business.businessType),
      firstProduct: productCount > 0,
      stockIn: stockInCount > 0,
      firstSale: saleCount > 0,
      firstReport: Boolean(savedProgress.firstReport)
    };
    const completedSteps = Object.values(steps).filter(Boolean).length;
    const totalSteps = 5;
    const completed = completedSteps === totalSteps;

    if (completed !== business.onboardingCompleted) {
      await this.prisma.business.update({
        where: { id: business.id },
        data: {
          onboardingCompleted: completed,
          onboardingProgress: { ...savedProgress, ...steps } as Prisma.InputJsonObject
        }
      });
    }

    return {
      completed,
      completedSteps,
      totalSteps,
      percent: Math.round((completedSteps / totalSteps) * 100),
      steps
    };
  }

  async markFirstReportViewed(user: CurrentUser) {
    this.requireBusiness(user);
    await this.mergeOnboardingProgress(user.businessId!, { firstReport: true });
    return this.onboardingStatus(user);
  }

  async createSampleData(user: CurrentUser) {
    this.requireBusiness(user);
    const suffix = Date.now().toString().slice(-5);
    const sampleProducts = [
      ["น้ำดื่ม 600ml", "DRINK", 5, 10, 12, 48],
      ["ขนมถุงเล็ก", "SNACK", 8, 15, 10, 30],
      ["สบู่ก้อน", "SOAP", 14, 25, 8, 20],
      ["ยาสีฟัน", "PASTE", 28, 45, 6, 18],
      ["กระดาษทิชชู่", "TISSUE", 18, 29, 10, 24],
      ["กาแฟกระป๋อง", "COFFEE", 12, 20, 12, 36]
    ] as const;

    for (const [name, sku, costPrice, salePrice, minStock, initialStock] of sampleProducts) {
      await this.createProduct(user, {
        name,
        sku: `${sku}-${suffix}`,
        costPrice,
        salePrice,
        minStock,
        initialStock
      });
    }

    return this.onboardingStatus(user);
  }

  async listProducts(user: CurrentUser, query = "", status?: string, branchId?: string) {
    this.requireBusiness(user);
    const statuses = this.productListStatuses(status);
    const search = query.trim();
    const scope = await this.scopedLocation(user, { branchId });
    const useBranchStatus = Boolean(scope.branchId);
    const products = await this.prisma.product.findMany({
      where: {
        businessId: user.businessId,
        status: useBranchStatus ? { in: this.productBaseStatusesForBranchList(statuses) as any } : { in: statuses as any },
        OR: search
          ? [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search } },
              { variantColor: { contains: search, mode: "insensitive" } },
              { variantSize: { contains: search, mode: "insensitive" } },
              { productGroup: { is: { name: { contains: search, mode: "insensitive" } } } },
              { category: { is: { name: { contains: search, mode: "insensitive" } } } },
              { brand: { is: { name: { contains: search, mode: "insensitive" } } } }
            ]
          : undefined
      },
      include: {
        productGroup: true,
        category: true,
        brand: true,
        branchStatuses: useBranchStatus ? { where: { branchId: scope.branchId } } : false,
        balances: {
          ...(Object.keys(scope.inventoryBalanceWhere).length ? { where: scope.inventoryBalanceWhere } : {}),
          include: { warehouse: { include: { branch: true } } }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    return this.applyProductBranchStatuses(products, scope.branchId).filter((product) => statuses.includes(product.status as any));
  }

  async createProduct(user: CurrentUser, dto: ProductDto) {
    this.assertProductMasterOwner(user);
    if (dto.receiveNow && (dto.initialStock ?? 0) > 0) throw new BadRequestException("Choose receiveNow or initialStock, not both");
    if (dto.receiveNow) return this.createProductWithReceipt(user, dto);
    if ((dto.initialStock ?? 0) > 0) return this.createProductWithInitialStock(user, dto);
    if (dto.warehouseId) return this.createProductAssignedToWarehouse(user, dto);
    this.requireBusiness(user);
    await this.enforceProductLimit(user.businessId!);
    const categoryId = dto.categoryName ? (await this.upsertCategory(user.businessId!, dto.categoryName)).id : undefined;
    const brandId = dto.brandName ? (await this.upsertBrand(user.businessId!, dto.brandName)).id : undefined;
    try {
      return await this.prisma.product.create({
        data: {
          businessId: user.businessId!,
          categoryId,
          brandId,
          sku: dto.sku,
          barcode: dto.barcode,
          name: dto.name,
          description: dto.description,
          unit: dto.unit ?? "ชิ้น",
          costPrice: dto.costPrice,
          salePrice: dto.salePrice,
          minStock: dto.minStock
        }
      });
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  async createProductVariants(user: CurrentUser, dto: ProductVariantsDto) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    if (!this.canReceiveInventory(user)) throw new ForbiddenException("Requires inventory.receive permission");
    const colors = this.uniqueTrimmedValues(dto.colors, "กรุณาระบุสีอย่างน้อย 1 ค่า");
    const sizes = this.uniqueTrimmedValues(dto.sizes, "กรุณาระบุไซส์อย่างน้อย 1 ค่า");
    const expectedVariantCount = colors.length * sizes.length;
    if (dto.variants.length !== expectedVariantCount) throw new BadRequestException("จำนวน variant ต้องตรงกับสีและไซส์ที่ระบุ");
    await this.enforceProductLimitForNewProducts(user.businessId!, expectedVariantCount);
    const rowKeySet = new Set<string>();
    for (const row of dto.variants) {
      const color = row.color.trim();
      const size = row.size.trim();
      if (!colors.includes(color) || !sizes.includes(size)) throw new BadRequestException("variant ต้องใช้สีและไซส์จากรายการที่ระบุ");
      const key = this.variantKey(color, size);
      if (rowKeySet.has(key)) throw new BadRequestException("มี variant สี/ไซส์ซ้ำในรายการ");
      rowKeySet.add(key);
    }
    for (const color of colors) {
      for (const size of sizes) {
        if (!rowKeySet.has(this.variantKey(color, size))) throw new BadRequestException(`ขาด variant ${color} / ${size}`);
      }
    }
    const skus = dto.variants.map((row) => row.sku.trim()).filter(Boolean);
    const barcodes = dto.variants.map((row) => row.barcode?.trim()).filter(Boolean) as string[];
    this.assertNoDuplicateValues(skus, "มี SKU ซ้ำในรายการ variant");
    this.assertNoDuplicateValues(barcodes, "มี barcode ซ้ำในรายการ variant");
    if (skus.length !== expectedVariantCount) throw new BadRequestException("ทุก variant ต้องมี SKU");
    await this.assertVariantCodesAvailable(user.businessId!, skus, barcodes);
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: dto.warehouseId });
    const warehouse = await this.resolveWarehouse(user.businessId!, dto.branchId, dto.warehouseId);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const categoryId = dto.categoryName ? (await this.upsertCategoryWithClient(tx, user.businessId!, dto.categoryName)).id : undefined;
        const brandId = dto.brandName ? (await this.upsertBrandWithClient(tx, user.businessId!, dto.brandName)).id : undefined;
        const group = await (tx as any).productGroup.create({
          data: {
            businessId: user.businessId!,
            categoryId,
            brandId,
            name: dto.name,
            skuPrefix: dto.skuPrefix.trim(),
            description: dto.description,
            unit: dto.unit ?? "ชิ้น"
          }
        });
        const receiptRows = dto.variants.filter((row) => (row.receiveQuantity ?? 0) > 0);
        const receipt = receiptRows.length > 0
          ? await tx.stockReceipt.create({
              data: {
                businessId: user.businessId!,
                warehouseId: warehouse.id,
                userId: user.userId,
                documentNo: await this.nextDocumentNo(tx, user.businessId!, "REC"),
                supplier: dto.receiveSupplier,
                note: dto.receiveNote,
                totalCost: receiptRows.reduce((sum, row) => sum + (row.receiveQuantity ?? 0) * (row.receiveUnitCost ?? row.costPrice ?? dto.costPrice), 0)
              }
            })
          : null;
        const products = [];
        for (const row of dto.variants) {
          const receiveQuantity = row.receiveQuantity ?? 0;
          const costPrice = row.costPrice ?? dto.costPrice;
          const product = await tx.product.create({
            data: {
              businessId: user.businessId!,
              productGroupId: group.id,
              categoryId,
              brandId,
              sku: row.sku.trim(),
              barcode: row.barcode?.trim() || undefined,
              name: dto.name,
              description: dto.description,
              variantColor: row.color.trim(),
              variantSize: row.size.trim(),
              unit: dto.unit ?? "ชิ้น",
              costPrice,
              salePrice: row.salePrice ?? dto.salePrice,
              minStock: row.minStock ?? dto.minStock
            }
          });
          await tx.inventoryBalance.upsert({
            where: { businessId_warehouseId_productId: { businessId: user.businessId!, warehouseId: warehouse.id, productId: product.id } },
            create: { businessId: user.businessId!, warehouseId: warehouse.id, productId: product.id, quantity: 0 },
            update: {}
          });
          if (receipt && receiveQuantity > 0) {
            const unitCost = row.receiveUnitCost ?? costPrice;
            const stockChange = await this.addStock(tx, user.businessId!, warehouse.id, product.id, receiveQuantity, PRODUCT_STOCK_RECEIPT_STATUSES);
            await tx.stockMovement.create({
              data: {
                businessId: user.businessId!,
                warehouseId: warehouse.id,
                productId: product.id,
                userId: user.userId,
                type: "RECEIVE_IN",
                quantity: receiveQuantity,
                balanceBefore: stockChange.balanceBefore,
                balanceAfter: stockChange.quantity,
                unitCost,
                reference: receipt.documentNo
              }
            });
          }
          products.push(product);
        }
        return (tx as any).productGroup.findFirstOrThrow({
          where: { id: group.id, businessId: user.businessId },
          include: {
            category: true,
            brand: true,
            products: { include: { productGroup: true, category: true, brand: true, balances: { include: { warehouse: { include: { branch: true } } } } }, orderBy: [{ variantColor: "asc" }, { variantSize: "asc" }] }
          }
        });
      });
      await this.notifications.refreshStockAlertsForProducts(user.businessId!, result.products.map((product: any) => product.id), [warehouse.branchId]);
      return result;
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  private async createProductAssignedToWarehouse(user: CurrentUser, dto: ProductDto) {
    this.requireBusiness(user);
    await this.enforceProductLimit(user.businessId!);
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: dto.warehouseId });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await this.resolveWarehouseWithClient(tx, user.businessId!, dto.warehouseId!, dto.branchId);
        const product = await this.createProductRecord(tx, user.businessId!, dto);
        await tx.inventoryBalance.upsert({
          where: { businessId_warehouseId_productId: { businessId: user.businessId!, warehouseId: warehouse.id, productId: product.id } },
          create: { businessId: user.businessId!, warehouseId: warehouse.id, productId: product.id, quantity: 0 },
          update: {}
        });
        return tx.product.findFirstOrThrow({
          where: { id: product.id, businessId: user.businessId },
          include: { category: true, brand: true, balances: { include: { warehouse: { include: { branch: true } } } } }
        });
      });
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  private async createProductWithReceipt(user: CurrentUser, dto: ProductDto) {
    this.requireBusiness(user);
    if (!this.canReceiveInventory(user)) throw new ForbiddenException("Requires inventory.receive permission");
    const receiveNow = dto.receiveNow!;
    await this.enforceProductLimit(user.businessId!);
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: receiveNow.warehouseId });
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const warehouse = await this.resolveWarehouseWithClient(tx, user.businessId!, receiveNow.warehouseId, dto.branchId);
        const product = await this.createProductRecord(tx, user.businessId!, dto);
        const receipt = await tx.stockReceipt.create({
          data: {
            businessId: user.businessId!,
            warehouseId: warehouse.id,
            userId: user.userId,
            documentNo: await this.nextDocumentNo(tx, user.businessId!, "REC"),
            supplier: receiveNow.supplier,
            note: receiveNow.note,
            totalCost: receiveNow.quantity * receiveNow.unitCost
          }
        });
        const stockChange = await this.addStock(tx, user.businessId!, warehouse.id, product.id, receiveNow.quantity, PRODUCT_STOCK_RECEIPT_STATUSES);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            warehouseId: warehouse.id,
            productId: product.id,
            userId: user.userId,
            type: "RECEIVE_IN",
            quantity: receiveNow.quantity,
            balanceBefore: stockChange.balanceBefore,
            balanceAfter: stockChange.quantity,
            unitCost: receiveNow.unitCost,
            reference: receipt.documentNo
          }
        });
        return tx.product.findFirstOrThrow({
          where: { id: product.id, businessId: user.businessId },
          include: { category: true, brand: true, balances: true, movements: { take: 20, orderBy: { createdAt: "desc" } } }
        });
      });
      await this.notifications.refreshStockAlertsForProducts(user.businessId!, [result.id]);
      return result;
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  async getProduct(user: CurrentUser, id: string, filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    const product = await (this.prisma.product as any).findFirst({
      where: { id, businessId: user.businessId },
      include: {
        productGroup: true,
        category: true,
        brand: true,
        branchStatuses: scope.branchId ? { where: { branchId: scope.branchId } } : false,
        balances: { where: scope.inventoryBalanceWhere, include: { warehouse: { include: { branch: true } } } },
        movements: {
          take: 20,
          where: scope.stockMovementWhere,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true } }, warehouse: { include: { branch: true } } }
        }
      }
    });
    if (!product) throw new NotFoundException("Product not found");
    return this.applyProductBranchStatus(product, scope.branchId);
  }

  private async createProductWithInitialStock(user: CurrentUser, dto: ProductDto) {
    this.requireBusiness(user);
    await this.enforceProductLimit(user.businessId!);
    const categoryId = dto.categoryName ? (await this.upsertCategory(user.businessId!, dto.categoryName)).id : undefined;
    const brandId = dto.brandName ? (await this.upsertBrand(user.businessId!, dto.brandName)).id : undefined;
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: dto.warehouseId });
    const warehouse = await this.resolveWarehouse(user.businessId!, dto.branchId, dto.warehouseId);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            businessId: user.businessId!,
            categoryId,
            brandId,
            sku: dto.sku,
            barcode: dto.barcode,
            name: dto.name,
            description: dto.description,
            unit: dto.unit ?? "ชิ้น",
            costPrice: dto.costPrice,
            salePrice: dto.salePrice,
            minStock: dto.minStock
          }
        });
        const stockChange = await this.addStock(tx, user.businessId!, warehouse.id, product.id, dto.initialStock!);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            warehouseId: warehouse.id,
            productId: product.id,
            userId: user.userId,
            type: "RECEIVE_IN",
            quantity: dto.initialStock!,
            balanceBefore: stockChange.balanceBefore,
            balanceAfter: stockChange.quantity,
            unitCost: dto.costPrice,
            reference: "INITIAL-STOCK"
          }
        });
        return tx.product.findFirstOrThrow({
          where: { id: product.id, businessId: user.businessId },
          include: { category: true, brand: true, balances: true, movements: { take: 20, orderBy: { createdAt: "desc" } } }
        });
      });
      await this.notifications.refreshStockAlertsForProducts(user.businessId!, [result.id], [warehouse.branchId]);
      return result;
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  async updateProduct(user: CurrentUser, id: string, dto: Partial<ProductDto>) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    if (product.status === "ARCHIVED") throw new BadRequestException("Archived products cannot be edited");
    if ((dto as { status?: string }).status === "ARCHIVED") throw new BadRequestException("Use archive action to archive products");
    if (dto.salePrice !== undefined && !user.isSystemAdmin && !hasPermission(user.role as Role, user.permissionOverrides, "products.update_price")) {
      throw new ForbiddenException("Requires products.update_price permission");
    }
    if (dto.costPrice !== undefined && !user.isSystemAdmin && !hasPermission(user.role as Role, user.permissionOverrides, "products.update_cost")) {
      throw new ForbiddenException("Requires products.update_cost permission");
    }
    const categoryId = dto.categoryName ? (await this.upsertCategory(user.businessId!, dto.categoryName)).id : undefined;
    const brandId = dto.brandName ? (await this.upsertBrand(user.businessId!, dto.brandName)).id : undefined;
    const { categoryName: _categoryName, brandName: _brandName, initialStock: _initialStock, receiveNow: _receiveNow, ...productData } = dto;
    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: { ...productData, categoryId, brandId }
      });
      await this.auditProductUpdate(user, product, { ...productData, categoryId, brandId });
      return updated;
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  async updateProductImage(user: CurrentUser, id: string, file: ProductImageFile) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    if (product.status === "ARCHIVED") throw new BadRequestException("Archived products cannot be edited");
    this.productImageStorage.validate(file);
    const nextImagePath = await this.productImageStorage.saveProductImage(file);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imagePath: nextImagePath }
    });
    await this.productImageStorage.deleteProductImage(product.imagePath);
    return updated;
  }

  async deleteProductImage(user: CurrentUser, id: string) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    if (product.status === "ARCHIVED") throw new BadRequestException("Archived products cannot be edited");
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imagePath: null }
    });
    await this.productImageStorage.deleteProductImage(product.imagePath);
    return updated;
  }

  async archiveProduct(user: CurrentUser, id: string) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    const archive = await this.canArchiveProduct(user.businessId!, id);
    if (!archive.allowed) throw new BadRequestException(archive.reasons.join(", "));
    return this.updateProductStatus(user, product, "ARCHIVED", "product.archive");
  }

  async pauseProduct(user: CurrentUser, id: string, branchId?: string) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    const product = await this.getProduct(user, id, { branchId });
    return this.updateProductStatus(user, product, "PAUSED", "product.pause", branchId);
  }

  async discontinueProduct(user: CurrentUser, id: string, branchId?: string) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    const product = await this.getProduct(user, id, { branchId });
    return this.updateProductStatus(user, product, "DISCONTINUED", "product.discontinue", branchId);
  }

  async reactivateProduct(user: CurrentUser, id: string, branchId?: string) {
    this.assertProductMasterOwner(user);
    this.requireBusiness(user);
    const product = await this.getProduct(user, id, { branchId });
    if (!this.isProductCountedInLimit(product)) await this.enforceProductLimit(user.businessId!);
    const nextStatus = product.status === "ARCHIVED" ? "PAUSED" : "ACTIVE";
    const action = product.status === "ARCHIVED" ? "product.restore" : "product.reactivate";
    return this.updateProductStatus(user, product, nextStatus, action, product.status === "ARCHIVED" ? undefined : branchId);
  }

  async balances(user: CurrentUser, filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    return this.prisma.inventoryBalance.findMany({
      where: { businessId: user.businessId, product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } }, ...scope.inventoryBalanceWhere },
      include: { product: { include: { category: true, brand: true } }, warehouse: { include: { branch: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  async searchInventory(user: CurrentUser, query = "", filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const search = query.trim();
    if (search.length < 2) return [];
    const scope = await this.scopedLocation(user, filters);
    const balanceWhere = scope.inventoryBalanceWhere;
    const products = await (this.prisma.product as any).findMany({
      where: {
        businessId: user.businessId,
        status: { in: PRODUCT_MANAGEMENT_STATUSES as any },
        ...scope.productWhere,
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search } },
          { category: { is: { name: { contains: search, mode: "insensitive" } } } },
          { brand: { is: { name: { contains: search, mode: "insensitive" } } } }
        ]
      },
      include: {
        category: true,
        brand: true,
        branchStatuses: scope.branchId ? { where: { branchId: scope.branchId } } : false,
        balances: {
          ...(Object.keys(balanceWhere).length > 0 ? { where: balanceWhere } : {}),
          include: { warehouse: { include: { branch: true } } }
        }
      },
      take: 100
    });

    return this.applyProductBranchStatuses(products, scope.branchId).sort((left, right) => {
      const rightStock = right.balances.reduce((sum: number, balance: { quantity: number }) => sum + balance.quantity, 0);
      const leftStock = left.balances.reduce((sum: number, balance: { quantity: number }) => sum + balance.quantity, 0);
      if ((rightStock > 0) !== (leftStock > 0)) return rightStock > 0 ? 1 : -1;
      if (rightStock !== leftStock) return rightStock - leftStock;
      return left.name.localeCompare(right.name, "th");
    }).slice(0, 30);
  }

  async receive(user: CurrentUser, dto: ReceiptDto) {
    this.requireBusiness(user);
    if (!dto.items.length) throw new BadRequestException("Receipt must include at least one item");
    const newProductCount = dto.items.filter((item) => item.newProduct).length;
    for (const item of dto.items) {
      const hasExistingProduct = Boolean(item.productId);
      const hasNewProduct = Boolean(item.newProduct);
      if (hasExistingProduct === hasNewProduct) throw new BadRequestException("แต่ละรายการต้องเลือกสินค้าเดิมหรือกรอกสินค้าใหม่อย่างใดอย่างหนึ่ง");
    }
    if (newProductCount > 0) {
      if (!this.canCreateProductsFromReceipt(user)) throw new ForbiddenException("Only the store owner can create new products from receiving");
      await this.enforceProductLimitForNewProducts(user.businessId!, newProductCount);
    }
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: dto.warehouseId });
    const warehouse = await this.resolveWarehouse(user.businessId!, dto.branchId, dto.warehouseId);
    try {
      const receipt = await this.prisma.$transaction(async (tx) => {
        const receipt = await tx.stockReceipt.create({
          data: {
            businessId: user.businessId!,
            warehouseId: warehouse.id,
            userId: user.userId,
            documentNo: await this.nextDocumentNo(tx, user.businessId!, "REC"),
            supplier: dto.supplier,
            note: dto.note,
            totalCost: dto.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
          }
        });
        for (const item of dto.items) {
          const productId = item.productId ?? (await this.createReceiptProduct(tx, user.businessId!, item.newProduct!, item.unitCost)).id;
          const stockChange = await this.addStock(tx, user.businessId!, warehouse.id, productId, item.quantity, PRODUCT_STOCK_RECEIPT_STATUSES);
          await tx.stockMovement.create({
            data: {
              businessId: user.businessId!,
              warehouseId: warehouse.id,
              productId,
              userId: user.userId,
              type: "RECEIVE_IN",
              quantity: item.quantity,
              balanceBefore: stockChange.balanceBefore,
              balanceAfter: stockChange.quantity,
              unitCost: item.unitCost,
              reference: receipt.documentNo
            }
          });
        }
        return receipt;
      });
      await this.notifications.refreshStockAlertsForProducts(user.businessId!, dto.items.map((item) => item.productId).filter(Boolean) as string[], [warehouse.branchId]);
      return receipt;
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  async adjust(user: CurrentUser, dto: AdjustmentDto) {
    this.requireBusiness(user);
    if (dto.quantity === 0) throw new BadRequestException("Adjustment quantity cannot be zero");
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: dto.warehouseId });
    const warehouse = await this.resolveWarehouse(user.businessId!, dto.branchId, dto.warehouseId);
    const adjustmentMode = dto.adjustmentMode ?? (dto.quantity > 0 ? "INCREASE" : "DECREASE");
    const adjustment = await this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          businessId: user.businessId!,
          warehouseId: warehouse.id,
          userId: user.userId,
          documentNo: await this.nextDocumentNo(tx, user.businessId!, "ADJ"),
          reason: dto.reason,
          adjustmentMode,
          targetQuantity: dto.targetQuantity
        }
      });
      const stockChange = dto.quantity > 0
        ? await this.addStock(tx, user.businessId!, warehouse.id, dto.productId, dto.quantity)
        : await this.removeStock(tx, user.businessId!, warehouse.id, dto.productId, Math.abs(dto.quantity));
      await tx.stockMovement.create({
        data: {
          businessId: user.businessId!,
          warehouseId: warehouse.id,
          productId: dto.productId,
          userId: user.userId,
          type: dto.quantity > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantity: Math.abs(dto.quantity),
          balanceBefore: stockChange.balanceBefore,
          balanceAfter: stockChange.quantity,
          reason: dto.reason,
          adjustmentMode,
          targetQuantity: dto.targetQuantity,
          reference: adjustment.documentNo
        }
      });
      return adjustment;
    });
    await this.notifications.refreshStockAlertsForProducts(user.businessId!, [dto.productId], [warehouse.branchId]);
    return adjustment;
  }

  async listStockCounts(user: CurrentUser, filters: { warehouseId?: string } = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, { warehouseId: filters.warehouseId });
    const counts = await this.prisma.stockCount.findMany({
      where: { businessId: user.businessId, ...(scope.warehouseId ? { warehouseId: scope.warehouseId } : scope.branchIds ? { warehouse: { branchId: { in: scope.branchIds } } } : {}) },
      include: {
        warehouse: { include: { branch: true } },
        user: { select: { id: true, name: true } },
        items: { select: { countedQuantity: true, difference: true } }
      },
      orderBy: { startedAt: "desc" },
      take: 50
    });
    return counts.map((count) => this.stockCountListRow(count));
  }

  async createStockCount(user: CurrentUser, dto: StockCountCreateDto) {
    this.requireBusiness(user);
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: dto.warehouseId });
    const warehouse = await this.resolveWarehouse(user.businessId!, dto.branchId, dto.warehouseId);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { businessId: user.businessId, warehouseId: warehouse.id, product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } },
      include: { product: { include: { category: true, brand: true } } }
    });
    if (balances.length === 0) throw new BadRequestException("คลังนี้ยังไม่มีรายการสต็อกให้เริ่มนับ");
    const sortedBalances = balances.sort((left, right) => {
      const category = (left.product.category?.name ?? "").localeCompare(right.product.category?.name ?? "", "th");
      if (category !== 0) return category;
      return left.product.name.localeCompare(right.product.name, "th");
    });
    const stockCount = await this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.create({
        data: {
          businessId: user.businessId!,
          warehouseId: warehouse.id,
          userId: user.userId,
          documentNo: await this.nextDocumentNo(tx, user.businessId!, "CNT"),
          note: dto.note
        }
      });
      await tx.stockCountItem.createMany({
        data: sortedBalances.map((balance) => ({
          stockCountId: count.id,
          productId: balance.productId,
          systemQuantity: balance.quantity
        }))
      });
      return count;
    });
    return this.getStockCount(user, stockCount.id);
  }

  async getStockCount(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, businessId: user.businessId },
      include: this.stockCountDetailInclude()
    });
    if (!stockCount) throw new NotFoundException("Stock count not found");
    if (!this.hasAllBranchAccess(user)) await this.assertBranchAccess(user, stockCount.warehouse.branchId);
    return this.stockCountDetail(stockCount);
  }

  async updateStockCountItems(user: CurrentUser, id: string, dto: StockCountItemsUpdateDto) {
    this.requireBusiness(user);
    const stockCount = await this.prisma.stockCount.findFirst({ where: { id, businessId: user.businessId }, include: { items: true, warehouse: true } });
    if (!stockCount) throw new NotFoundException("Stock count not found");
    if (!this.hasAllBranchAccess(user)) await this.assertBranchAccess(user, stockCount.warehouse.branchId);
    if (stockCount.status !== "COUNTING") throw new BadRequestException("รอบนับนี้แก้ไขไม่ได้แล้ว");
    const itemsByProductId = new Map(stockCount.items.map((item) => [item.productId, item]));
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const existing = itemsByProductId.get(item.productId);
        if (!existing) throw new BadRequestException("พบสินค้าที่ไม่ได้อยู่ในรอบนับนี้");
        const countedQuantity = item.countedQuantity ?? null;
        await tx.stockCountItem.update({
          where: { stockCountId_productId: { stockCountId: id, productId: item.productId } },
          data: {
            countedQuantity,
            difference: countedQuantity === null ? null : countedQuantity - existing.systemQuantity,
            note: item.note?.trim() || null
          }
        });
      }
    });
    return this.getStockCount(user, id);
  }

  async reviewStockCount(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const stockCount = await this.prisma.stockCount.findFirst({ where: { id, businessId: user.businessId }, include: { items: true, warehouse: true } });
    if (!stockCount) throw new NotFoundException("Stock count not found");
    if (!this.hasAllBranchAccess(user)) await this.assertBranchAccess(user, stockCount.warehouse.branchId);
    if (stockCount.status === "APPLIED" || stockCount.status === "CANCELED") throw new BadRequestException("รอบนับนี้ปิดแล้ว");
    if (stockCount.items.some((item) => item.countedQuantity === null)) throw new BadRequestException("กรุณากรอกยอดนับจริงให้ครบก่อนตรวจทาน");
    if (stockCount.status !== "REVIEW") {
      await this.prisma.stockCount.update({ where: { id }, data: { status: "REVIEW", completedAt: new Date() } });
    }
    const updated = await this.getStockCount(user, id);
    await this.notifications.createStockCountReviewNotification(user.businessId!, id);
    return updated;
  }

  async applyStockCount(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    if (!this.hasAllBranchAccess(user)) {
      const countForAccess = await this.prisma.stockCount.findFirst({ where: { id, businessId: user.businessId }, include: { warehouse: true } });
      if (!countForAccess) throw new NotFoundException("Stock count not found");
      await this.assertBranchAccess(user, countForAccess.warehouse.branchId);
    }
    const changedProductIds = await this.prisma.$transaction(async (tx) => {
      const stockCount = await tx.stockCount.findFirst({
        where: { id, businessId: user.businessId },
        include: { items: { include: { product: true } } }
      });
      if (!stockCount) throw new NotFoundException("Stock count not found");
      if (stockCount.status === "APPLIED") throw new BadRequestException("รอบนับนี้ปรับสต็อกไปแล้ว");
      if (stockCount.status === "CANCELED") throw new BadRequestException("รอบนับนี้ถูกยกเลิกแล้ว");
      if (stockCount.status !== "REVIEW") throw new BadRequestException("กรุณาตรวจทานส่วนต่างก่อนยืนยันปรับสต็อก");
      if (stockCount.items.some((item) => item.countedQuantity === null)) throw new BadRequestException("กรุณากรอกยอดนับจริงให้ครบก่อนปรับสต็อก");
      const changedProductIds: string[] = [];
      for (const item of stockCount.items.filter((row) => row.difference !== 0 && row.countedQuantity !== null)) {
        const current = await tx.inventoryBalance.findUnique({ where: { businessId_warehouseId_productId: { businessId: user.businessId!, warehouseId: stockCount.warehouseId, productId: item.productId } } });
        const balanceBefore = current?.quantity ?? 0;
        const countedQuantity = item.countedQuantity!;
        const delta = countedQuantity - balanceBefore;
        if (delta === 0) continue;
        changedProductIds.push(item.productId);
        const adjustment = await tx.stockAdjustment.create({
          data: {
            businessId: user.businessId!,
            warehouseId: stockCount.warehouseId,
            userId: user.userId,
            documentNo: await this.nextDocumentNo(tx, user.businessId!, "ADJ"),
            reason: `นับสต็อก ${stockCount.documentNo}`,
            adjustmentMode: "SET_ACTUAL",
            targetQuantity: countedQuantity
          }
        });
        const stockChange = delta > 0
          ? await this.addStock(tx, user.businessId!, stockCount.warehouseId, item.productId, delta)
          : await this.removeStock(tx, user.businessId!, stockCount.warehouseId, item.productId, Math.abs(delta));
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            warehouseId: stockCount.warehouseId,
            productId: item.productId,
            userId: user.userId,
            type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            quantity: Math.abs(delta),
            balanceBefore: stockChange.balanceBefore,
            balanceAfter: stockChange.quantity,
            reason: `นับสต็อก ${stockCount.documentNo}`,
            adjustmentMode: "SET_ACTUAL",
            targetQuantity: countedQuantity,
            reference: adjustment.documentNo
          }
        });
      }
      await tx.stockCount.update({ where: { id }, data: { status: "APPLIED", appliedAt: new Date() } });
      return changedProductIds;
    });
    const updated = await this.getStockCount(user, id);
    await this.notifications.resolveStockCountReviewNotification(user.businessId!, id);
    if (changedProductIds.length > 0) await this.notifications.refreshStockAlertsForProducts(user.businessId!, changedProductIds, [updated.warehouse.branchId]);
    return updated;
  }

  async cancelStockCount(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const stockCount = await this.prisma.stockCount.findFirst({ where: { id, businessId: user.businessId }, include: { warehouse: true } });
    if (!stockCount) throw new NotFoundException("Stock count not found");
    if (!this.hasAllBranchAccess(user)) await this.assertBranchAccess(user, stockCount.warehouse.branchId);
    if (stockCount.status === "APPLIED") throw new BadRequestException("ยกเลิกรอบนับที่ปรับสต็อกแล้วไม่ได้");
    if (stockCount.status !== "CANCELED") {
      await this.prisma.stockCount.update({ where: { id }, data: { status: "CANCELED" } });
    }
    const updated = await this.getStockCount(user, id);
    await this.notifications.resolveStockCountReviewNotification(user.businessId!, id);
    return updated;
  }

  async movements(user: CurrentUser, filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    const movements = await this.prisma.stockMovement.findMany({
      where: { businessId: user.businessId, ...scope.stockMovementWhere },
      include: { product: true, warehouse: { include: { branch: true } }, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const transferReferences = Array.from(new Set(movements
      .map((movement) => movement.reference)
      .filter((reference): reference is string => Boolean(reference?.startsWith("TRF-")))));
    if (!transferReferences.length) return movements;
    const transfers = await this.prisma.stockTransfer.findMany({
      where: { businessId: user.businessId, documentNo: { in: transferReferences } },
      include: {
        sourceWarehouse: { include: { branch: true } },
        destinationWarehouse: { include: { branch: true } }
      }
    });
    const transferByDocumentNo = new Map(transfers.map((transfer) => [transfer.documentNo, transfer]));
    return movements.map((movement) => ({
      ...movement,
      transfer: movement.reference ? transferByDocumentNo.get(movement.reference) ?? null : null
    }));
  }

  async listTransfers(user: CurrentUser, filters: { status?: string; warehouseId?: string; branchId?: string; side?: string } = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    const transferStatus = this.transferStatus(filters.status);
    return this.prisma.stockTransfer.findMany({
      where: {
        businessId: user.businessId,
        ...(transferStatus ? { status: transferStatus as any } : {}),
        ...this.transferLocationWhere(scope, this.transferSide(filters.side))
      },
      include: this.transferInclude(),
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getTransfer(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, businessId: user.businessId },
      include: this.transferInclude()
    });
    if (!transfer) throw new NotFoundException("Transfer not found");
    const branchIds = await this.getAccessibleBranchIds(user);
    if (branchIds && !branchIds.includes(transfer.sourceWarehouse.branchId) && !branchIds.includes(transfer.destinationWarehouse.branchId)) {
      throw new NotFoundException("Transfer not found");
    }
    return transfer;
  }

  async createTransfer(user: CurrentUser, dto: TransferDto) {
    this.requireBusiness(user);
    if (dto.sourceWarehouseId === dto.destinationWarehouseId) throw new BadRequestException("ต้นทางและปลายทางต้องเป็นคนละคลัง");
    if (!dto.items.length) throw new BadRequestException("Transfer must include at least one item");
    const transfer = await this.prisma.$transaction(async (tx) => {
      const sourceWarehouse = await this.resolveWarehouseWithClient(tx, user.businessId!, dto.sourceWarehouseId);
      const destinationWarehouse = await this.resolveWarehouseWithClient(tx, user.businessId!, dto.destinationWarehouseId);
      if (!this.hasAllBranchAccess(user)) await this.assertBranchAccess(user, destinationWarehouse.branchId);
      if (sourceWarehouse.id === destinationWarehouse.id) throw new BadRequestException("ต้นทางและปลายทางต้องเป็นคนละคลัง");
      const products = await tx.product.findMany({
        where: { businessId: user.businessId, id: { in: dto.items.map((item) => item.productId) }, status: { in: PRODUCT_STOCK_ADJUSTMENT_STATUSES as any } }
      });
      const productMap = new Map(products.map((product) => [product.id, product]));
      const items = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new BadRequestException(`Invalid product ${item.productId}`);
        return { product, quantity: item.quantity, unitCost: Number(product.costPrice) };
      });
      const transfer = await tx.stockTransfer.create({
        data: {
          businessId: user.businessId!,
          sourceWarehouseId: sourceWarehouse.id,
          destinationWarehouseId: destinationWarehouse.id,
          createdById: user.userId,
          requestedById: user.userId,
          documentNo: await this.nextDocumentNo(tx, user.businessId!, "TRF"),
          status: "REQUESTED" as any,
          note: dto.note,
          items: {
            create: items.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              unitCost: item.unitCost
            }))
          }
        },
        include: this.transferInclude()
      });
      if (this.hasAllBranchAccess(user)) {
        for (const item of items) {
          const stockChange = await this.removeStock(tx, user.businessId!, sourceWarehouse.id, item.product.id, item.quantity);
          await tx.stockMovement.create({
            data: {
              businessId: user.businessId!,
              warehouseId: sourceWarehouse.id,
              productId: item.product.id,
              userId: user.userId,
              type: "TRANSFER_OUT",
              quantity: item.quantity,
              balanceBefore: stockChange.balanceBefore,
              balanceAfter: stockChange.quantity,
              unitCost: item.unitCost,
              reference: transfer.documentNo
            }
          });
        }
        return tx.stockTransfer.update({
          where: { id: transfer.id },
          data: { status: "IN_TRANSIT" as any, sourceApprovedById: user.userId, sourceApprovedAt: new Date() },
          include: this.transferInclude()
        });
      }
      return transfer;
    });
    if (transfer.status === "REQUESTED") {
      await this.notifications.createTransferRequestNotification(user.businessId!, transfer.id);
    } else {
      await this.notifications.createTransferStatusNotification(user.businessId!, transfer.id, "อยู่ระหว่างทาง", "INFO");
      await this.notifications.createTransferReceiveNotification(user.businessId!, transfer.id);
    }
    await this.notifications.refreshStockAlertsForProducts(user.businessId!, transfer.items.map((item: any) => item.productId), this.transferBranchIds(transfer));
    return transfer;
  }

  async approveTransferSource(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    this.assertTransferManagerRole(user);
    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await this.findTransferForWrite(tx, user.businessId!, id);
      if (transfer.status !== "REQUESTED") throw new BadRequestException("อนุมัติได้เฉพาะคำขอโอนที่รออนุมัติ");
      const sourceWarehouse = await tx.warehouse.findFirstOrThrow({ where: { id: transfer.sourceWarehouseId } });
      await this.assertBranchAccess(user, sourceWarehouse.branchId);
      for (const item of transfer.items) {
        const stockChange = await this.removeStock(tx, user.businessId!, transfer.sourceWarehouseId, item.productId, item.quantity);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            warehouseId: transfer.sourceWarehouseId,
            productId: item.productId,
            userId: user.userId,
            type: "TRANSFER_OUT",
            quantity: item.quantity,
            balanceBefore: stockChange.balanceBefore,
            balanceAfter: stockChange.quantity,
            unitCost: item.unitCost,
            reference: transfer.documentNo
          }
        });
      }
      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "IN_TRANSIT" as any, sourceApprovedById: user.userId, sourceApprovedAt: new Date() },
        include: this.transferInclude()
      });
    });
    await this.notifications.createTransferStatusNotification(user.businessId!, transfer.id, "ได้รับอนุมัติแล้ว", "SUCCESS");
    await this.notifications.createTransferReceiveNotification(user.businessId!, transfer.id);
    await this.notifications.refreshStockAlertsForProducts(user.businessId!, transfer.items.map((item: any) => item.productId), this.transferBranchIds(transfer, "source"));
    return transfer;
  }

  async rejectTransferSource(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    this.assertTransferManagerRole(user);
    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await this.findTransferForWrite(tx, user.businessId!, id);
      if (transfer.status !== "REQUESTED") throw new BadRequestException("ปฏิเสธได้เฉพาะคำขอโอนที่รออนุมัติ");
      const sourceWarehouse = await tx.warehouse.findFirstOrThrow({ where: { id: transfer.sourceWarehouseId } });
      await this.assertBranchAccess(user, sourceWarehouse.branchId);
      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "SOURCE_REJECTED" as any, sourceRejectedById: user.userId, sourceRejectedAt: new Date() },
        include: this.transferInclude()
      });
    });
    await this.notifications.createTransferStatusNotification(user.businessId!, transfer.id, "ถูกปฏิเสธ", "WARNING");
    return transfer;
  }

  async receiveTransfer(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    this.assertTransferManagerRole(user);
    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await this.findTransferForWrite(tx, user.businessId!, id);
      if (transfer.status !== "IN_TRANSIT") throw new BadRequestException("รับได้เฉพาะเอกสารที่อยู่ระหว่างทาง");
      const destinationWarehouse = await tx.warehouse.findFirstOrThrow({ where: { id: transfer.destinationWarehouseId } });
      await this.assertBranchAccess(user, destinationWarehouse.branchId);
      for (const item of transfer.items) {
        const stockChange = await this.addStock(tx, user.businessId!, transfer.destinationWarehouseId, item.productId, item.quantity);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            warehouseId: transfer.destinationWarehouseId,
            productId: item.productId,
            userId: user.userId,
            type: "TRANSFER_IN",
            quantity: item.quantity,
            balanceBefore: stockChange.balanceBefore,
            balanceAfter: stockChange.quantity,
            unitCost: item.unitCost,
            reference: transfer.documentNo
          }
        });
      }
      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "RECEIVED" as any, destinationConfirmedById: user.userId, destinationConfirmedAt: new Date(), receivedById: user.userId, receivedAt: new Date() },
        include: this.transferInclude()
      });
    });
    await this.notifications.createTransferStatusNotification(user.businessId!, transfer.id, "รับเข้าปลายทางแล้ว", "SUCCESS");
    await this.notifications.refreshStockAlertsForProducts(user.businessId!, transfer.items.map((item: any) => item.productId), this.transferBranchIds(transfer, "destination"));
    return transfer;
  }

  async cancelTransfer(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await this.findTransferForWrite(tx, user.businessId!, id);
      if (transfer.status === "REQUESTED") {
        const destinationWarehouse = await tx.warehouse.findFirstOrThrow({ where: { id: transfer.destinationWarehouseId } });
        if (transfer.createdById !== user.userId && transfer.requestedById !== user.userId) {
          this.assertTransferManagerRole(user);
          await this.assertBranchAccess(user, destinationWarehouse.branchId);
        }
        return tx.stockTransfer.update({
          where: { id: transfer.id },
          data: { status: "CANCELED" as any, canceledById: user.userId, canceledAt: new Date() },
          include: this.transferInclude()
        });
      }
      if (transfer.status !== "IN_TRANSIT") throw new BadRequestException("ยกเลิกได้เฉพาะคำขอที่รออนุมัติหรือเอกสารที่อยู่ระหว่างทาง");
      {
        const sourceWarehouse = await tx.warehouse.findFirstOrThrow({ where: { id: transfer.sourceWarehouseId } });
        this.assertTransferManagerRole(user);
        await this.assertBranchAccess(user, sourceWarehouse.branchId);
      }
      for (const item of transfer.items) {
        const stockChange = await this.addStock(tx, user.businessId!, transfer.sourceWarehouseId, item.productId, item.quantity);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            warehouseId: transfer.sourceWarehouseId,
            productId: item.productId,
            userId: user.userId,
            type: "TRANSFER_CANCEL",
            quantity: item.quantity,
            balanceBefore: stockChange.balanceBefore,
            balanceAfter: stockChange.quantity,
            unitCost: item.unitCost,
            reference: transfer.documentNo
          }
        });
      }
      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "CANCELED" as any, canceledById: user.userId, canceledAt: new Date() },
        include: this.transferInclude()
      });
    });
    await this.notifications.createTransferStatusNotification(user.businessId!, transfer.id, "ถูกยกเลิก", "WARNING");
    await this.notifications.refreshStockAlertsForProducts(user.businessId!, transfer.items.map((item: any) => item.productId), this.transferBranchIds(transfer));
    return transfer;
  }

  async createSale(user: CurrentUser, dto: SaleDto) {
    this.requireBusiness(user);
    if (!dto.items.length) throw new BadRequestException("Sale must include at least one item");
    await this.scopedLocation(user, { branchId: dto.branchId, warehouseId: dto.warehouseId });
    const { branch, warehouse } = await this.resolveSaleLocation(user.businessId!, dto.branchId, dto.warehouseId);
    const sale = await this.prisma.$transaction(async (tx) => {
      const products = this.applyProductBranchStatuses(await (tx.product as any).findMany({
        where: { businessId: user.businessId, id: { in: dto.items.map((item) => item.productId) }, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } },
        include: { branchStatuses: { where: { branchId: branch.id } } }
      }), branch.id).filter((product) => product.status === "ACTIVE" || product.status === undefined);
      const productMap = new Map(products.map((product) => [product.id, product]));
      const items = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new BadRequestException(`Invalid product ${item.productId}`);
        return {
          product,
          quantity: item.quantity,
          unitPrice: Number(product.salePrice),
          unitCost: Number(product.costPrice),
          total: Number(product.salePrice) * item.quantity
        };
      });
      const subtotal = items.reduce((sum, item) => sum + item.total, 0);
      const total = Math.max(0, subtotal - dto.discount);
      const sale = await tx.sale.create({
        data: {
          businessId: user.businessId!,
          branchId: branch.id,
          warehouseId: warehouse.id,
          userId: user.userId,
          receiptNo: await this.nextDocumentNo(tx, user.businessId!, "SALE"),
          subtotal,
          discount: dto.discount,
          total,
          paymentMethod: dto.paymentMethod,
          items: {
            create: items.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
              total: item.total
            }))
          }
        },
        include: { items: { include: { product: true } } }
      });
      for (const item of items) {
        const stockChange = await this.removeStock(tx, user.businessId!, warehouse.id, item.product.id, item.quantity);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            warehouseId: warehouse.id,
            productId: item.product.id,
            userId: user.userId,
            type: "SALE_OUT",
            quantity: item.quantity,
            balanceBefore: stockChange.balanceBefore,
            balanceAfter: stockChange.quantity,
            unitCost: item.unitCost,
            reference: sale.receiptNo
          }
        });
      }
      return sale;
    });
    await this.notifications.refreshStockAlertsForProducts(user.businessId!, sale.items.map((item: any) => item.productId), [branch.id]);
    return sale;
  }

  async listSales(user: CurrentUser, query: SaleListQueryDto = {}) {
    this.requireBusiness(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const scope = await this.scopedLocation(user, { branchId: query.branchId, warehouseId: query.warehouseId });
    const where = this.buildSalesWhere(user.businessId!, query, scope.saleWhere);
    const [data, total, totalSales, totalUnits] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { items: { include: { product: true } }, branch: true, warehouse: true, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({ where, _sum: { total: true } }),
      this.prisma.saleItem.aggregate({ where: { sale: where }, _sum: { quantity: true } })
    ]);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      summary: {
        total: Number(totalSales._sum.total ?? 0),
        units: totalUnits._sum.quantity ?? 0
      }
    };
  }

  async exportSalesCsv(user: CurrentUser, query: SaleListQueryDto = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, { branchId: query.branchId, warehouseId: query.warehouseId });
    const where = this.buildSalesWhere(user.businessId!, query, scope.saleWhere);
    const sales = await this.prisma.sale.findMany({
      where,
      include: { items: { include: { product: true } }, branch: true, warehouse: true, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000
    });
    const headers = ["เลขที่", "วันที่", "สถานะ", "ช่องทาง", "สาขา", "คลัง", "คนขาย", "รายการ", "จำนวนชิ้น", "รวมก่อนส่วนลด", "ส่วนลด", "ยอดสุทธิ"];
    const rows = sales.map((sale) => {
      const itemCount = sale.items.length;
      const unitCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
      const itemNames = sale.items.map((item) => `${item.product.name} x ${item.quantity}`).join("; ");
      return [
        sale.receiptNo,
        sale.createdAt.toISOString(),
        sale.status,
        sale.paymentMethod,
        sale.branch?.name ?? "",
        sale.warehouse?.name ?? "",
        sale.user?.name ?? "",
        itemCount > 0 ? itemNames : "",
        String(unitCount),
        String(sale.subtotal),
        String(sale.discount),
        String(sale.total)
      ];
    });
    return this.toCsv([headers, ...rows]);
  }

  async getSale(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const sale = await this.prisma.sale.findFirst({
      where: { id, businessId: user.businessId },
      include: { items: { include: { product: true } }, branch: true, warehouse: true, user: { select: { name: true } } }
    });
    if (!sale) throw new NotFoundException("Sale not found");
    await this.assertBranchAccess(user, sale.branchId);
    return sale;
  }

  async dashboard(user: CurrentUser, filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    const now = new Date();
    const today = this.startOfBangkokDay(now);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const month = this.startOfBangkokMonth(now);
    const weekStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const trendStart = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const businessId = user.businessId!;
    const saleScope = scope.saleWhere;
    const balanceScope = scope.inventoryBalanceWhere;
    const movementScope = scope.stockMovementWhere;
    const [business, salesToday, salesYesterday, salesThisMonth, todayReceiptCount, weekSales, trendSales, products, balances, recentSales, recentMovements, topProductItemsToday, topProductItemsWeek] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { salesTargetMode: true, annualSalesTarget: true, dailySalesTarget: true, monthlySalesTarget: true } }),
      this.prisma.sale.aggregate({ where: { businessId, createdAt: { gte: today, lt: tomorrow }, status: "PAID", ...saleScope }, _sum: { total: true } }),
      this.prisma.sale.aggregate({ where: { businessId, createdAt: { gte: yesterday, lt: today }, status: "PAID", ...saleScope }, _sum: { total: true } }),
      this.prisma.sale.aggregate({ where: { businessId, createdAt: { gte: month }, status: "PAID", ...saleScope }, _sum: { total: true } }),
      this.prisma.sale.count({ where: { businessId, createdAt: { gte: today, lt: tomorrow }, status: "PAID", ...saleScope } }),
      this.prisma.sale.findMany({ where: { businessId, createdAt: { gte: weekStart }, status: "PAID", ...saleScope }, select: { total: true, createdAt: true } }),
      this.prisma.sale.findMany({ where: { businessId, createdAt: { gte: trendStart }, status: "PAID", ...saleScope }, select: { total: true, createdAt: true } }),
      this.prisma.product.findMany({ where: { businessId: user.businessId, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } }),
      this.prisma.inventoryBalance.findMany({ where: { businessId: user.businessId, product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } }, ...balanceScope }, include: { product: true } }),
      this.prisma.sale.findMany({ where: { businessId, status: "PAID", ...saleScope }, orderBy: { createdAt: "desc" }, take: 5 }),
      this.prisma.stockMovement.findMany({ where: { businessId, ...movementScope }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 5 }),
      this.prisma.saleItem.findMany({
        where: { sale: { businessId, createdAt: { gte: today, lt: tomorrow }, status: "PAID", ...saleScope } },
        include: { product: { select: { id: true, name: true, sku: true } } }
      }),
      this.prisma.saleItem.findMany({
        where: { sale: { businessId, createdAt: { gte: weekStart }, status: "PAID", ...saleScope } },
        include: { product: { select: { id: true, name: true, sku: true } } }
      })
    ]);
    const productQuantities = new Map<string, number>();
    for (const balance of balances) {
      productQuantities.set(balance.productId, (productQuantities.get(balance.productId) ?? 0) + balance.quantity);
    }
    const stockRows = products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      quantity: productQuantities.get(product.id) ?? 0,
      minStock: product.minStock
    }));
    const lowStock = stockRows.filter((product) => product.quantity > 0 && product.quantity <= product.minStock);
    const outOfStock = stockRows.filter((product) => product.quantity <= 0);
    const salesTodayTotal = Number(salesToday._sum.total ?? 0);
    const salesYesterdayTotal = Number(salesYesterday._sum.total ?? 0);
    const salesThisMonthTotal = Number(salesThisMonth._sum.total ?? 0);
    const todayGrossProfit = this.sumGrossProfit(topProductItemsToday);
    const daysInCurrentMonth = this.daysInBangkokMonth(now);
    const goals = this.deriveSalesTargets(
      business.salesTargetMode,
      business.annualSalesTarget === null ? null : Number(business.annualSalesTarget),
      business.monthlySalesTarget === null ? null : Number(business.monthlySalesTarget),
      business.dailySalesTarget === null ? null : Number(business.dailySalesTarget),
      daysInCurrentMonth
    );

    return {
      role: user.role,
      goals: {
        ...goals,
        daysInCurrentMonth
      },
      sales: {
        todayTotal: salesTodayTotal,
        yesterdayTotal: salesYesterdayTotal,
        todayReceiptCount,
        averageReceiptValue: todayReceiptCount ? salesTodayTotal / todayReceiptCount : 0,
        todayGrossProfit,
        todayChangePercent: this.percentChange(salesTodayTotal, salesYesterdayTotal),
        monthTotal: salesThisMonthTotal,
        last7Days: this.buildSalesSeries(weekStart, weekSales),
        trend30Days: this.buildDashboardSalesTrend(trendStart, weekStart, trendSales),
        dailyTargetProgress: this.targetProgress(salesTodayTotal, goals.dailySalesTarget),
        monthlyTargetProgress: this.targetProgress(salesThisMonthTotal, goals.monthlySalesTarget)
      },
      inventory: {
        stockValue: balances.reduce((sum, balance) => sum + balance.quantity * Number(balance.product.costPrice), 0),
        totalProducts: products.length,
        lowStockProducts: lowStock.length,
        outOfStockProducts: outOfStock.length,
        lowStockPreview: lowStock.slice(0, 5),
        outOfStockPreview: outOfStock.slice(0, 5)
      },
      topProducts: {
        today: this.summarizeTopProducts(topProductItemsToday),
        last7Days: this.summarizeTopProducts(topProductItemsWeek)
      },
      summary: {
        salesToday: salesTodayTotal,
        salesThisMonth: salesThisMonthTotal,
        stockValue: balances.reduce((sum, balance) => sum + balance.quantity * Number(balance.product.costPrice), 0),
        totalProducts: products.length,
        lowStockProducts: lowStock.length,
        outOfStockProducts: outOfStock.length
      },
      recentSales,
      recentMovements
    };
  }

  async stockReport(user: CurrentUser, filters: LocationFilters = {}) {
    return this.stockReportIncludingEmptyProducts(user, filters);
  }

  async stockPlanningReport(user: CurrentUser, filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    const now = new Date();
    const today = this.startOfBangkokDay(now);
    const start = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const businessId = user.businessId!;
    const balanceWhere = scope.inventoryBalanceWhere;
    const saleWhere = {
      businessId,
      createdAt: { gte: start },
      status: "PAID" as const,
      ...scope.saleWhere
    };
    const [products, saleItems, branch, warehouse] = await Promise.all([
      this.prisma.product.findMany({
        where: { businessId, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } },
        include: { balances: { where: balanceWhere } },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.saleItem.findMany({
        where: { sale: saleWhere },
        select: { productId: true, quantity: true }
      }),
      filters.branchId ? this.prisma.branch.findFirst({ where: { id: filters.branchId, businessId }, select: { id: true, name: true } }) : Promise.resolve(null),
      filters.warehouseId ? this.prisma.warehouse.findFirst({ where: { id: filters.warehouseId, businessId }, select: { id: true, name: true, branchId: true } }) : Promise.resolve(null)
    ]);
    const soldByProduct = new Map<string, number>();
    for (const item of saleItems) {
      soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity);
    }
    const rows = products.map((product) => {
      const quantity = product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
      const costPrice = Number(product.costPrice);
      const sold30Days = soldByProduct.get(product.id) ?? 0;
      const avgDailySales30 = sold30Days / 30;
      const daysOfStock = avgDailySales30 > 0 ? quantity / avgDailySales30 : null;
      const suggestedRestockQty = Math.max(product.minStock * 2 - quantity, product.minStock - quantity, 0);
      const status = quantity === 0 ? "OUT" : quantity <= product.minStock ? "LOW" : "OK";
      const reason: StockPlanningReason =
        status === "OUT" ? "OUT" :
        status === "LOW" ? "LOW" :
        daysOfStock !== null && daysOfStock <= 7 && suggestedRestockQty > 0 ? "FAST_MOVING" :
        "HEALTHY";
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        variantColor: product.variantColor,
        variantSize: product.variantSize,
        imagePath: product.imagePath,
        quantity,
        minStock: product.minStock,
        costPrice,
        stockValue: quantity * costPrice,
        status,
        sold30Days,
        avgDailySales30,
        daysOfStock,
        suggestedRestockQty,
        estimatedCost: suggestedRestockQty * costPrice,
        reason
      };
    });
    const replenishmentRows = rows
      .filter((row) => row.reason !== "HEALTHY" && row.suggestedRestockQty > 0)
      .sort((left, right) => this.stockPlanningReasonRank(left.reason) - this.stockPlanningReasonRank(right.reason) || right.estimatedCost - left.estimatedCost);
    const valueRows = rows
      .filter((row) => row.stockValue > 0)
      .sort((left, right) => right.stockValue - left.stockValue)
      .slice(0, 8);

    return {
      scope: {
        branchId: filters.branchId ?? null,
        branchName: branch?.name ?? null,
        warehouseId: filters.warehouseId ?? null,
        warehouseName: warehouse?.name ?? null
      },
      summary: {
        replenishmentCount: replenishmentRows.length,
        estimatedRestockCost: replenishmentRows.reduce((sum, row) => sum + row.estimatedCost, 0),
        stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
        outOfStockCount: rows.filter((row) => row.status === "OUT").length,
        lowStockCount: rows.filter((row) => row.status === "LOW").length,
        fastMovingCount: rows.filter((row) => row.reason === "FAST_MOVING").length,
        totalProducts: rows.length
      },
      replenishmentRows,
      valueRows
    };
  }

  private stockPlanningReasonRank(reason: StockPlanningReason) {
    const rank: Record<StockPlanningReason, number> = {
      OUT: 0,
      LOW: 1,
      FAST_MOVING: 2,
      HEALTHY: 3
    };
    return rank[reason];
  }

  private async stockReportIncludingEmptyProducts(user: CurrentUser, filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    const balanceWhere = scope.inventoryBalanceWhere;
    const products = await this.prisma.product.findMany({
      where: { businessId: user.businessId, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } },
      include: { balances: { where: balanceWhere } },
      orderBy: { createdAt: "desc" }
    });
    return products.map((product) => {
      const quantity = product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        variantColor: product.variantColor,
        variantSize: product.variantSize,
        quantity,
        minStock: product.minStock,
        stockValue: quantity * Number(product.costPrice),
        status: quantity === 0 ? "OUT" : quantity <= product.minStock ? "LOW" : "OK"
      };
    });
  }

  private async legacyStockReport(user: CurrentUser) {
    const balances = await this.balances(user);
    return balances.map((balance) => ({
      productId: balance.productId,
      sku: balance.product.sku,
      name: balance.product.name,
      quantity: balance.quantity,
      minStock: balance.product.minStock,
      stockValue: balance.quantity * Number(balance.product.costPrice),
      status: balance.quantity === 0 ? "OUT" : balance.quantity <= balance.product.minStock ? "LOW" : "OK"
    }));
  }

  async salesReport(user: CurrentUser, filters: LocationFilters = {}) {
    this.requireBusiness(user);
    const scope = await this.scopedLocation(user, filters);
    const now = new Date();
    const today = this.startOfBangkokDay(now);
    const start = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const businessId = user.businessId!;
    const saleWhere = {
      businessId,
      createdAt: { gte: start },
      status: "PAID" as const,
      ...scope.saleWhere
    };
    const [sales, topProductItems] = await Promise.all([
      this.prisma.sale.findMany({
        where: saleWhere,
        include: {
          branch: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
          user: { select: { name: true } },
          items: true
        },
        orderBy: { createdAt: "desc" },
        take: 300
      }),
      this.prisma.saleItem.findMany({
        where: { sale: saleWhere },
        include: { product: { select: { id: true, name: true, sku: true } } }
      })
    ]);
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + Number(sale.discount), 0);
    const totalUnits = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    const paymentMethods = this.summarizeSalesBreakdown(sales, (sale) => sale.paymentMethod);
    const branches = this.summarizeSalesBreakdown(sales, (sale) => sale.branch?.name ?? "ไม่ระบุสาขา");

    return {
      range: { start: this.bangkokDateKey(start), end: this.bangkokDateKey(now), days: 30 },
      summary: {
        totalRevenue,
        receiptCount: sales.length,
        averageReceipt: sales.length ? totalRevenue / sales.length : 0,
        totalDiscount,
        totalUnits
      },
      dailySales: this.buildSalesSeries(start, sales, 30),
      paymentMethods,
      branches,
      topProducts: this.summarizeTopProducts(topProductItems),
      recentSales: sales.slice(0, 8).map((sale) => ({
        id: sale.id,
        receiptNo: sale.receiptNo,
        createdAt: sale.createdAt,
        total: sale.total,
        discount: sale.discount,
        paymentMethod: sale.paymentMethod,
        branch: sale.branch,
        warehouse: sale.warehouse,
        sellerName: sale.user?.name,
        itemCount: sale.items.length,
        unitCount: sale.items.reduce((sum, item) => sum + item.quantity, 0)
      }))
    };
  }

  private summarizeSalesBreakdown<T>(sales: T[], getLabel: (sale: T) => string) {
    const rows = new Map<string, { label: string; total: number; count: number }>();
    for (const sale of sales as Array<T & { total: Prisma.Decimal }>) {
      const label = getLabel(sale);
      const current = rows.get(label) ?? { label, total: 0, count: 0 };
      current.total += Number(sale.total);
      current.count += 1;
      rows.set(label, current);
    }
    return [...rows.values()].sort((left, right) => right.total - left.total);
  }

  private hasAllBranchAccess(user: CurrentUser) {
    return user.isSystemAdmin || user.role === "OWNER";
  }

  private assertProductMasterOwner(user: CurrentUser) {
    if (user.isSystemAdmin || user.role === "OWNER") return;
    throw new ForbiddenException("Only the store owner can manage product master data");
  }

  private async getAccessibleBranchIds(user: CurrentUser) {
    if (this.hasAllBranchAccess(user)) return undefined;
    if (Array.isArray(user.assignedBranchIds)) return user.assignedBranchIds;
    if (!user.businessId || !user.userId) return [];
    const member = await this.prisma.businessMember.findFirst({
      where: { businessId: user.businessId, userId: user.userId, status: "ACTIVE" },
      select: {
        role: true,
        branchAssignments: { where: { branch: { status: "ACTIVE" } }, select: { branchId: true } }
      }
    });
    if (!member || member.role === "OWNER") return undefined;
    return member.branchAssignments.map((assignment) => assignment.branchId);
  }

  private async assertBranchAccess(user: CurrentUser, branchId: string) {
    this.requireBusiness(user);
    if (!(this.prisma as any).branch?.findFirst) {
      if (this.hasAllBranchAccess(user)) return { id: branchId, businessId: user.businessId, status: "ACTIVE" };
      throw new ForbiddenException("Branch is not assigned to this user");
    }
    const branch = await this.assertBranch(user.businessId!, branchId);
    const branchIds = await this.getAccessibleBranchIds(user);
    if (branchIds && !branchIds.includes(branch.id)) throw new ForbiddenException("Branch is not assigned to this user");
    return branch;
  }

  private async scopedLocation(user: CurrentUser, filters: LocationFilters = {}): Promise<ScopedLocation> {
    this.requireBusiness(user);
    const allowedBranchIds = await this.getAccessibleBranchIds(user);
    let branchId = filters.branchId;
    let warehouseId = filters.warehouseId;

    if (branchId) await this.assertBranchAccess(user, branchId);

    if (warehouseId) {
      const warehouseDelegate = (this.prisma as any).warehouse;
      if (warehouseDelegate?.findFirst) {
        const warehouse = await warehouseDelegate.findFirst({ where: { id: warehouseId, businessId: user.businessId }, include: { branch: true } });
        if (!warehouse) throw new BadRequestException("Warehouse is not available for this business");
        if (warehouse.status !== "ACTIVE") throw new BadRequestException("Warehouse is inactive");
        if (warehouse.branch?.status && warehouse.branch.status !== "ACTIVE") throw new BadRequestException("Branch is inactive");
        if (branchId && warehouse.branchId !== branchId) throw new BadRequestException("Warehouse does not belong to the selected branch");
        if (allowedBranchIds && !allowedBranchIds.includes(warehouse.branchId)) throw new ForbiddenException("Branch is not assigned to this user");
        branchId = branchId ?? warehouse.branchId;
        warehouseId = warehouse.id;
      } else if (allowedBranchIds) {
        throw new ForbiddenException("Branch is not assigned to this user");
      }
    }

    const branchIds = branchId ? [branchId] : allowedBranchIds;
    const branchFilter = branchId ? { id: branchId } : branchIds ? { id: { in: branchIds } } : {};
    const warehouseBranchFilter = branchId ? { branchId } : branchIds ? { branchId: { in: branchIds } } : {};
    const warehouseFilter = warehouseId ? { id: warehouseId } : warehouseBranchFilter;
    const balanceFilter = warehouseId
      ? { warehouseId, ...(branchId ? { warehouse: { branchId } } : {}) }
      : branchId
        ? { warehouse: { branchId } }
        : branchIds
          ? { warehouse: { branchId: { in: branchIds } } }
          : {};
    const movementFilter = warehouseId
      ? { warehouseId, ...(branchId ? { warehouse: { branchId } } : {}) }
      : branchId
        ? { warehouse: { branchId } }
        : branchIds
          ? { warehouse: { branchId: { in: branchIds } } }
          : {};
    const productFilter = warehouseId
      ? { balances: { some: { warehouseId } } }
      : branchId
        ? { balances: { some: { warehouse: { branchId } } } }
      : branchIds
        ? { balances: { some: { warehouse: { branchId: { in: branchIds } } } } }
        : {};
    const saleFilter = {
      ...(branchId ? { branchId } : branchIds ? { branchId: { in: branchIds } } : {}),
      ...(warehouseId ? { warehouseId } : {})
    };
    const transferFilter = warehouseId
      ? { OR: [{ sourceWarehouseId: warehouseId }, { destinationWarehouseId: warehouseId }] }
      : branchId
        ? { OR: [{ sourceWarehouse: { branchId } }, { destinationWarehouse: { branchId } }] }
      : branchIds
        ? { OR: [{ sourceWarehouse: { branchId: { in: branchIds } } }, { destinationWarehouse: { branchId: { in: branchIds } } }] }
        : {};

    return {
      branchIds,
      branchId,
      warehouseId,
      branchWhere: branchFilter,
      warehouseWhere: warehouseFilter,
      inventoryBalanceWhere: balanceFilter,
      stockMovementWhere: movementFilter,
      productWhere: productFilter,
      saleWhere: saleFilter,
      transferWhere: transferFilter
    };
  }

  private inventoryBalanceLocationWhere(filters: LocationFilters) {
    return {
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.branchId ? { warehouse: { branchId: filters.branchId } } : {})
    };
  }

  private warehouseLocationWhere(filters: LocationFilters) {
    return {
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.branchId ? { warehouse: { branchId: filters.branchId } } : {})
    };
  }

  private saleLocationWhere(filters: LocationFilters) {
    return {
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {})
    };
  }

  private transferInclude() {
    return {
      sourceWarehouse: { include: { branch: true } },
      destinationWarehouse: { include: { branch: true } },
      createdBy: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true } },
      sourceApprovedBy: { select: { id: true, name: true } },
      sourceRejectedBy: { select: { id: true, name: true } },
      destinationConfirmedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
      canceledBy: { select: { id: true, name: true } },
      items: { include: { product: { include: { category: true, brand: true } } } }
    };
  }

  private transferStatus(status?: string) {
    if (!status) return undefined;
    const normalized = status.trim().toUpperCase();
    if (["REQUESTED", "SOURCE_APPROVED", "IN_TRANSIT", "RECEIVED", "SOURCE_REJECTED", "CANCELED"].includes(normalized)) return normalized;
    throw new BadRequestException("Invalid transfer status filter");
  }

  private transferSide(side?: string) {
    if (!side) return "both";
    const normalized = side.trim().toLowerCase();
    if (normalized === "source" || normalized === "destination" || normalized === "both") return normalized;
    throw new BadRequestException("Invalid transfer side filter");
  }

  private transferLocationWhere(scope: ScopedLocation, side: "source" | "destination" | "both") {
    if (side === "both") return scope.transferWhere;
    const relation = side === "source" ? "sourceWarehouse" : "destinationWarehouse";
    const warehouseIdField = side === "source" ? "sourceWarehouseId" : "destinationWarehouseId";
    if (scope.warehouseId) return { [warehouseIdField]: scope.warehouseId };
    if (scope.branchId) return { [relation]: { branchId: scope.branchId } };
    if (scope.branchIds) return { [relation]: { branchId: { in: scope.branchIds } } };
    return {};
  }

  private transferBranchIds(transfer: any, side: "source" | "destination" | "both" = "both") {
    const branchIds = [
      side !== "destination" ? transfer.sourceWarehouse?.branchId : undefined,
      side !== "source" ? transfer.destinationWarehouse?.branchId : undefined
    ].filter(Boolean);
    return branchIds.length > 0 ? Array.from(new Set(branchIds)) : undefined;
  }

  private productLocationWhere(filters: LocationFilters) {
    if (filters.warehouseId) return { balances: { some: { warehouseId: filters.warehouseId } } };
    if (filters.branchId) return { balances: { some: { warehouse: { branchId: filters.branchId } } } };
    return {};
  }

  async members(user: CurrentUser, branchId?: string) {
    this.requireBusiness(user);
    if (branchId) await this.assertBranchAccess(user, branchId);
    const allowedBranchIds = branchId ? [branchId] : await this.getAccessibleBranchIds(user);
    const branchTokens = allowedBranchIds ? await this.memberBranchTokens(user.businessId!, allowedBranchIds) : undefined;
    const members = await this.prisma.businessMember.findMany({
      where: { businessId: user.businessId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        requestedBranch: true,
        branchAssignments: { include: { branch: true }, orderBy: { createdAt: "asc" } }
      },
      orderBy: { createdAt: "desc" }
    });
    return members
      .filter((member) => member.role === "OWNER" || this.isMemberInBranchScope(member, allowedBranchIds, branchTokens))
      .map((member) => this.serializeMember(member));
  }

  async approveMemberRequest(user: CurrentUser, id: string, dto: MemberApprovalDto) {
    this.requireBusiness(user);
    const member = await this.assertEditableMember(user, id, "Owner request cannot be changed");
    if (member.status !== "PENDING") throw new BadRequestException("อนุมัติได้เฉพาะคำขอที่รออนุมัติ");
    if (!member.userId) throw new BadRequestException("คำขอนี้ไม่มีบัญชีผู้ใช้");
    await this.enforceUserLimit(user.businessId!);
    const permissionOverrides = normalizePermissionOverrides(dto.overrides ?? {});
    const branchIds = await this.validateMemberBranchIds(user.businessId!, dto.branchIds ?? []);
    await this.assertMemberBranchSelectionAccess(user, branchIds);
    if (branchIds.length === 0) throw new BadRequestException("กรุณาเลือกสาขาให้พนักงานก่อนอนุมัติ");
    const updatedMember = await this.prisma.$transaction(async (tx) => {
      await tx.businessMember.update({
        where: { id: member.id },
        data: {
          role: dto.role as RoleName,
          status: "ACTIVE",
          permissionOverrides: permissionOverrides as Prisma.InputJsonObject
        }
      });
      await tx.businessMemberBranch.deleteMany({ where: { businessMemberId: member.id } });
      await tx.businessMemberBranch.createMany({
        data: branchIds.map((branchId) => ({ businessMemberId: member.id, branchId })),
        skipDuplicates: true
      });
      const updated = await tx.businessMember.findFirstOrThrow({
        where: { id: member.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          requestedBranch: true,
          branchAssignments: { include: { branch: true }, orderBy: { createdAt: "asc" } }
        }
      });
      return this.serializeMember(updated);
    });
    await this.notifications.resolveStaffRequestNotification(user.businessId!, member.id);
    return updatedMember;
  }

  async rejectMemberRequest(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const member = await this.assertEditableMember(user, id, "Owner request cannot be changed");
    if (member.status !== "PENDING") throw new BadRequestException("ปฏิเสธได้เฉพาะคำขอที่รออนุมัติ");
    const rejected = this.serializeMember(
      await this.prisma.businessMember.update({
        where: { id: member.id },
        data: { status: "REJECTED" },
        include: { user: { select: { id: true, name: true, email: true } }, requestedBranch: true, branchAssignments: { include: { branch: true } } }
      })
    );
    await this.notifications.resolveStaffRequestNotification(user.businessId!, member.id);
    return rejected;
  }

  async updateMemberRole(user: CurrentUser, id: string, role: RoleName) {
    this.requireBusiness(user);
    const member = await this.assertEditableMember(user, id, "Owner role cannot be changed");
    return this.serializeMember(await this.prisma.businessMember.update({ where: { id: member.id }, data: { role }, include: { user: { select: { id: true, name: true, email: true } }, requestedBranch: true, branchAssignments: { include: { branch: true } } } }));
  }

  async updateMemberStatus(user: CurrentUser, id: string, status: "ACTIVE" | "DISABLED") {
    this.requireBusiness(user);
    const member = await this.assertEditableMember(user, id, "Owner status cannot be changed");
    if (status === "ACTIVE") {
      const assignmentCount = await this.prisma.businessMemberBranch.count({ where: { businessMemberId: member.id, branch: { status: "ACTIVE" as any } } });
      if (assignmentCount === 0) throw new BadRequestException("กรุณาเลือกสาขาให้พนักงานก่อนเปิดใช้งาน");
    }
    return this.serializeMember(await this.prisma.businessMember.update({ where: { id: member.id }, data: { status }, include: { user: { select: { id: true, name: true, email: true } }, requestedBranch: true, branchAssignments: { include: { branch: true } } } }));
  }

  async updateMemberPermissions(user: CurrentUser, id: string, overrides: Record<string, boolean>) {
    this.requireBusiness(user);
    const member = await this.assertEditableMember(user, id, "Owner permissions cannot be changed");
    const permissionOverrides = normalizePermissionOverrides(overrides);
    return this.serializeMember(
      await this.prisma.businessMember.update({
        where: { id: member.id },
        data: { permissionOverrides: permissionOverrides as Prisma.InputJsonObject },
        include: { user: { select: { id: true, name: true, email: true } }, requestedBranch: true, branchAssignments: { include: { branch: true } } }
      })
    );
  }

  async updateMemberBranches(user: CurrentUser, id: string, branchIds: string[]) {
    this.requireBusiness(user);
    const member = await this.assertEditableMember(user, id, "Owner branch access cannot be changed");
    const validatedBranchIds = await this.validateMemberBranchIds(user.businessId!, branchIds);
    await this.assertMemberBranchSelectionAccess(user, validatedBranchIds);
    if (member.status === "ACTIVE" && validatedBranchIds.length === 0) throw new BadRequestException("กรุณาเลือกสาขาให้พนักงานอย่างน้อย 1 สาขา");
    return this.prisma.$transaction(async (tx) => {
      await tx.businessMemberBranch.deleteMany({ where: { businessMemberId: member.id } });
      if (validatedBranchIds.length > 0) {
        await tx.businessMemberBranch.createMany({
          data: validatedBranchIds.map((branchId) => ({ businessMemberId: member.id, branchId })),
          skipDuplicates: true
        });
      }
      const updated = await tx.businessMember.findFirstOrThrow({
        where: { id: member.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          requestedBranch: true,
          branchAssignments: { include: { branch: true }, orderBy: { createdAt: "asc" } }
        }
      });
      return this.serializeMember(updated);
    });
  }

  async adminBusinesses(user: CurrentUser) {
    this.requireSystemAdmin(user);
    return this.prisma.business.findMany({ include: { subscription: { include: { plan: true } }, members: true }, orderBy: { createdAt: "desc" } });
  }

  async adminUsers(user: CurrentUser) {
    this.requireSystemAdmin(user);
    return this.prisma.user.findMany({ include: { memberships: { include: { business: true } } }, orderBy: { createdAt: "desc" } });
  }

  async adminSubscriptions(user: CurrentUser) {
    this.requireSystemAdmin(user);
    return this.prisma.businessSubscription.findMany({ include: { business: true, plan: true }, orderBy: { updatedAt: "desc" } });
  }

  async createAccountPaymentRequest(user: CurrentUser, dto: CheckoutPaymentDto) {
    this.requireBusiness(user);
    await this.expirePromptPaySubscriptionIfNeeded(user.businessId!);
    const planCode = dto.planCode.toUpperCase();
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive) throw new BadRequestException("แพ็กเกจนี้ยังไม่เปิดให้ชำระเงิน");

    const checkoutMode: CheckoutMode = dto.checkoutMode ?? "subscription";
    await this.assertPlanCheckoutAllowed(user.businessId!, plan, checkoutMode);

    const billingCycle = "monthly";
    const amount = this.accountPaymentAmount(plan, billingCycle, dto.metadata);
    if (amount <= 0) throw new BadRequestException("แพ็กเกจนี้ยังไม่พร้อมรับชำระเงินอัตโนมัติ");

    const provider = dto.provider?.trim() || (checkoutMode === "promptpay" ? "stripe_promptpay" : this.stripePriceId(planCode, billingCycle) ? "stripe" : "manual");
    const payment = await this.prisma.accountPaymentRequest.create({
      data: {
        reference: this.paymentReference(planCode, billingCycle),
        userId: user.userId,
        businessId: user.businessId ?? null,
        planId: plan.id,
        planCode,
        billingCycle,
        checkoutMode,
        amount,
        provider,
        providerPaymentId: dto.providerPaymentId?.trim() || null,
        checkoutUrl: dto.checkoutUrl?.trim() || null,
        metadata: {
          ...(dto.metadata ?? {}),
          checkoutMode,
          accountEmail: user.email
        } as Prisma.InputJsonObject
      },
      include: { plan: true }
    });

    if (provider === "stripe" || provider === "stripe_promptpay") {
      const checkout = await this.createStripeCheckoutSession(user, payment, checkoutMode);
      const updated = await this.prisma.accountPaymentRequest.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: checkout.id,
          stripeCheckoutSessionId: checkout.id,
          checkoutUrl: checkout.url
        },
        include: { plan: true }
      });
      return this.serializeAccountPayment(updated);
    }

    return this.serializeAccountPayment(payment);
  }

  async handlePaymentWebhook(dto: PaymentWebhookDto) {
    const payment = await this.prisma.accountPaymentRequest.findUnique({
      where: { reference: dto.reference },
      include: { plan: true }
    });
    if (!payment) throw new NotFoundException("Payment request not found");
    if (dto.amount !== undefined && Number(payment.amount) !== dto.amount) throw new BadRequestException("Payment amount does not match request");
    if (dto.currency && dto.currency !== payment.currency) throw new BadRequestException("Payment currency does not match request");

    if (payment.status === "PAID") return this.serializeAccountPayment(payment);

    const updated = await this.prisma.$transaction(async (tx) => {
      const paymentCheckoutMode = String(this.jsonObject(payment.metadata).checkoutMode ?? payment.checkoutMode ?? "");
      if (dto.status === "PAID" && payment.businessId) {
        const blockReason = await this.planCheckoutBlockReason(tx, payment.businessId, payment.plan, paymentCheckoutMode === "subscription" ? "subscription" : paymentCheckoutMode === "promptpay" ? "promptpay" : undefined);
        if (blockReason) {
          return tx.accountPaymentRequest.update({
            where: { id: payment.id },
            data: {
              status: "CANCELED",
              provider: dto.provider?.trim() || payment.provider,
              providerPaymentId: dto.providerPaymentId?.trim() || payment.providerPaymentId,
              stripeCheckoutSessionId: typeof dto.metadata?.stripeCheckoutSessionId === "string" ? dto.metadata.stripeCheckoutSessionId : payment.stripeCheckoutSessionId,
              stripePaymentIntentId: typeof dto.metadata?.paymentIntentId === "string" ? dto.metadata.paymentIntentId : payment.stripePaymentIntentId,
              failureReason: blockReason,
              metadata: {
                ...this.jsonObject(payment.metadata),
                webhook: dto.metadata ?? {},
                blocked: { reason: blockReason }
              } as Prisma.InputJsonObject
            },
            include: { plan: true }
          });
        }
      }

      const nextPayment = await tx.accountPaymentRequest.update({
        where: { id: payment.id },
        data: {
          status: dto.status,
          provider: dto.provider?.trim() || payment.provider,
          providerPaymentId: dto.providerPaymentId?.trim() || payment.providerPaymentId,
          stripeCheckoutSessionId: typeof dto.metadata?.stripeCheckoutSessionId === "string" ? dto.metadata.stripeCheckoutSessionId : payment.stripeCheckoutSessionId,
          stripePaymentIntentId: typeof dto.metadata?.paymentIntentId === "string" ? dto.metadata.paymentIntentId : payment.stripePaymentIntentId,
          failureReason: dto.status === "PAID" ? null : payment.failureReason,
          paidAt: dto.status === "PAID" ? new Date() : payment.paidAt,
          metadata: {
            ...this.jsonObject(payment.metadata),
            webhook: dto.metadata ?? {}
          } as Prisma.InputJsonObject
        },
        include: { plan: true }
      });

      if (dto.status === "PAID" && payment.businessId) {
        const webhook = this.jsonObject(dto.metadata as any);
        const checkoutMode = String(webhook.checkoutMode ?? payment.checkoutMode ?? this.jsonObject(payment.metadata).checkoutMode ?? "");
        const paidAt = dto.status === "PAID" ? new Date() : payment.paidAt ?? new Date();
        if (checkoutMode === "promptpay" || payment.provider === "manual") {
          await this.activatePromptPaySubscription(tx, payment, paidAt);
        } else {
          await this.activateStripeSubscription(tx, payment, webhook);
        }
        await tx.auditLog.create({
          data: {
            businessId: payment.businessId,
            userId: payment.userId,
            action: "subscription.payment_paid",
            entity: "AccountPaymentRequest",
            entityId: payment.id,
            after: {
              reference: payment.reference,
              planCode: payment.planCode,
              amount: Number(payment.amount),
              billingCycle: payment.billingCycle
            } as Prisma.InputJsonObject
          }
        });
      }

      return nextPayment;
    });

    return this.serializeAccountPayment(updated);
  }

  async handleStripeWebhookEvent(event: { id?: string; type?: string; data?: { object?: any } }) {
    if (event.id) {
      const existing = await this.prisma.stripeWebhookEvent.findUnique({ where: { eventId: event.id } });
      if (existing) return { received: true, duplicate: true };
    }

    let result: unknown = { received: true, ignored: true };
    const object = event.data?.object;
    if (event.type === "checkout.session.completed") {
      result = await this.handleStripeCheckoutSession(object, false);
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      result = await this.handleStripeCheckoutSession(object, true);
    } else if (event.type === "checkout.session.async_payment_failed") {
      result = await this.failStripeCheckoutSession(object, "async_payment_failed");
    } else if (event.type === "checkout.session.expired") {
      result = await this.failStripeCheckoutSession(object, "checkout_session_expired", "CANCELED");
    } else if (event.type === "invoice.paid") {
      result = await this.handleStripeInvoicePaid(object);
    } else if (event.type === "invoice.payment_failed") {
      result = await this.handleStripeInvoiceFailed(object);
    } else if (event.type === "customer.subscription.updated") {
      result = await this.handleStripeSubscriptionUpdated(object);
    } else if (event.type === "customer.subscription.deleted") {
      result = await this.handleStripeSubscriptionDeleted(object);
    }

    if (event.id) {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          eventType: event.type ?? "unknown",
          objectId: typeof object?.id === "string" ? object.id : null
        }
      });
    }
    return result;
  }

  async createBillingPortalSession(user: CurrentUser) {
    this.requireBusiness(user);
    const subscription = await this.expirePromptPaySubscriptionIfNeeded(user.businessId!);
    if (!subscription?.stripeCustomerId) throw new BadRequestException("ยังไม่มี Stripe customer สำหรับบัญชีนี้");
    const webAppUrl = (process.env.WEB_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const body = await this.stripeRequest<{ id: string; url: string }>("/v1/billing_portal/sessions", {
      customer: subscription.stripeCustomerId,
      return_url: `${webAppUrl}/app/billing`
    });
    return { url: body.url };
  }

  async cancelStripeSubscriptionAtPeriodEnd(user: CurrentUser) {
    this.requireBusiness(user);
    const subscription = await this.expirePromptPaySubscriptionIfNeeded(user.businessId!);
    if (!subscription?.stripeSubscriptionId || subscription.paymentMode !== "STRIPE_SUBSCRIPTION") {
      throw new BadRequestException("บัญชีนี้ยังไม่มี subscription รายเดือนอัตโนมัติ");
    }
    const body = await this.stripeRequest<any>(`/v1/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`, {
      cancel_at_period_end: "true"
    });
    const periodEnd = this.stripeTimestamp(body.current_period_end) ?? subscription.currentPeriodEnd;
    return this.prisma.businessSubscription.update({
      where: { businessId: user.businessId },
      data: {
        cancelAtPeriodEnd: true,
        currentPeriodStart: this.stripeTimestamp(body.current_period_start) ?? subscription.currentPeriodStart,
        currentPeriodEnd: periodEnd,
        expiresAt: periodEnd
      }
    });
  }

  async updateSubscription(user: CurrentUser, businessId: string, planCode: string) {
    this.requireSystemAdmin(user);
    const plan = await this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: planCode } });
    return this.prisma.businessSubscription.upsert({
      where: { businessId },
      create: { businessId, planId: plan.id },
      update: { planId: plan.id, status: "ACTIVE", paymentMode: plan.code === "FREE" ? "FREE" : "PROMPTPAY_ONE_TIME" }
    });
  }

  private async handleStripeCheckoutSession(session: any, asyncPaymentSucceeded: boolean) {
    const reference = session?.client_reference_id ?? session?.metadata?.reference;
    if (!reference) throw new BadRequestException("Stripe session missing payment reference");
    const checkoutMode = session?.metadata?.checkoutMode;
    if (checkoutMode === "promptpay" && !asyncPaymentSucceeded && session.payment_status !== "paid") {
      return { received: true, pending: true };
    }
    return this.handlePaymentWebhook({
      reference,
      status: "PAID",
      provider: checkoutMode === "promptpay" ? "stripe_promptpay" : "stripe",
      providerPaymentId: session.id,
      amount: checkoutMode === "promptpay" && typeof session.amount_total === "number" ? session.amount_total / 100 : undefined,
      currency: typeof session.currency === "string" ? session.currency.toUpperCase() : undefined,
      metadata: {
        checkoutMode,
        stripeCheckoutSessionId: session.id,
        paymentIntentId: session.payment_intent,
        subscriptionId: session.subscription,
        customerId: session.customer,
        paymentStatus: session.payment_status
      }
    });
  }

  private async failStripeCheckoutSession(session: any, reason: string, status: "FAILED" | "CANCELED" = "FAILED") {
    const reference = session?.client_reference_id ?? session?.metadata?.reference;
    if (!reference) return { received: true, ignored: true };
    const payment = await this.prisma.accountPaymentRequest.findUnique({ where: { reference } });
    if (!payment || payment.status === "PAID") return { received: true, ignored: true };
    return this.prisma.accountPaymentRequest.update({
      where: { reference },
      data: {
        status,
        failureReason: reason,
        stripeCheckoutSessionId: session.id ?? payment.stripeCheckoutSessionId,
        stripePaymentIntentId: session.payment_intent ?? payment.stripePaymentIntentId,
        metadata: {
          ...this.jsonObject(payment.metadata),
          failure: { reason, paymentStatus: session.payment_status ?? null }
        } as Prisma.InputJsonObject
      }
    });
  }

  private async handleStripeInvoicePaid(invoice: any) {
    const subscriptionId = this.stripeSubscriptionIdFromInvoice(invoice);
    if (!subscriptionId) return { received: true, ignored: true };
    const current = await this.prisma.businessSubscription.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
    if (!current) return { received: true, ignored: true };
    const period = this.periodFromStripeObject(invoice);
    return this.prisma.businessSubscription.update({
      where: { businessId: current.businessId },
      data: {
        status: "ACTIVE",
        paymentMode: "STRIPE_SUBSCRIPTION",
        currentPeriodStart: period.start ?? current.currentPeriodStart,
        currentPeriodEnd: period.end ?? current.currentPeriodEnd,
        expiresAt: null
      }
    });
  }

  private async handleStripeInvoiceFailed(invoice: any) {
    const subscriptionId = this.stripeSubscriptionIdFromInvoice(invoice);
    if (!subscriptionId) return { received: true, ignored: true };
    const current = await this.prisma.businessSubscription.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
    if (!current) return { received: true, ignored: true };
    const shouldSuspend = current.currentPeriodEnd ? current.currentPeriodEnd.getTime() < Date.now() : false;
    return this.prisma.businessSubscription.update({
      where: { businessId: current.businessId },
      data: { status: shouldSuspend ? "SUSPENDED" : current.status }
    });
  }

  private async handleStripeSubscriptionUpdated(subscription: any) {
    const current = await this.prisma.businessSubscription.findFirst({ where: { stripeSubscriptionId: subscription?.id } });
    if (!current) return { received: true, ignored: true };
    return this.prisma.businessSubscription.update({
      where: { businessId: current.businessId },
      data: {
        status: subscription.status === "active" || subscription.status === "trialing" ? "ACTIVE" : current.status,
        paymentMode: "STRIPE_SUBSCRIPTION",
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : current.stripeCustomerId,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        currentPeriodStart: this.stripeTimestamp(subscription.current_period_start) ?? current.currentPeriodStart,
        currentPeriodEnd: this.stripeTimestamp(subscription.current_period_end) ?? current.currentPeriodEnd,
        expiresAt: subscription.cancel_at_period_end ? this.stripeTimestamp(subscription.current_period_end) ?? current.currentPeriodEnd : null
      }
    });
  }

  private async handleStripeSubscriptionDeleted(subscription: any) {
    const current = await this.prisma.businessSubscription.findFirst({ where: { stripeSubscriptionId: subscription?.id } });
    if (!current) return { received: true, ignored: true };
    const freePlan = await this.freePlan();
    const periodEnd = this.stripeTimestamp(subscription.current_period_end) ?? current.currentPeriodEnd;
    if (periodEnd && periodEnd.getTime() > Date.now()) {
      return this.prisma.businessSubscription.update({
        where: { businessId: current.businessId },
        data: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: periodEnd,
          expiresAt: periodEnd
        }
      });
    }
    return this.prisma.businessSubscription.update({
      where: { businessId: current.businessId },
      data: {
        planId: freePlan.id,
        status: "EXPIRED",
        paymentMode: "FREE",
        cancelAtPeriodEnd: false,
        expiresAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        stripeSubscriptionId: null
      }
    });
  }

  private async activatePromptPaySubscription(tx: Prisma.TransactionClient, payment: any, paidAt: Date) {
    const current = await tx.businessSubscription.findUnique({ where: { businessId: payment.businessId } });
    const extensionBase = current?.paymentMode === "PROMPTPAY_ONE_TIME" && current.expiresAt && current.expiresAt.getTime() > paidAt.getTime()
      ? current.expiresAt
      : paidAt;
    const expiresAt = new Date(extensionBase.getTime() + PROMPTPAY_ACCESS_DAYS * 24 * 60 * 60 * 1000);
    await tx.businessSubscription.upsert({
      where: { businessId: payment.businessId },
      create: {
        businessId: payment.businessId,
        planId: payment.planId,
        status: "ACTIVE",
        paymentMode: "PROMPTPAY_ONE_TIME",
        expiresAt
      },
      update: {
        planId: payment.planId,
        status: "ACTIVE",
        paymentMode: "PROMPTPAY_ONE_TIME",
        cancelAtPeriodEnd: false,
        currentPeriodStart: paidAt,
        currentPeriodEnd: expiresAt,
        expiresAt,
        stripeSubscriptionId: null
      }
    });
  }

  private async activateStripeSubscription(tx: Prisma.TransactionClient, payment: any, webhook: Record<string, unknown>) {
    const subscriptionId = typeof webhook.subscriptionId === "string" ? webhook.subscriptionId : undefined;
    const customerId = typeof webhook.customerId === "string" ? webhook.customerId : undefined;
    const subscription = subscriptionId ? await this.stripeRequest<any>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, "GET") : undefined;
    await tx.businessSubscription.upsert({
      where: { businessId: payment.businessId },
      create: {
        businessId: payment.businessId,
        planId: payment.planId,
        status: "ACTIVE",
        paymentMode: "STRIPE_SUBSCRIPTION",
        stripeCustomerId: customerId ?? (typeof subscription?.customer === "string" ? subscription.customer : undefined),
        stripeSubscriptionId: subscriptionId,
        currentPeriodStart: this.stripeTimestamp(subscription?.current_period_start),
        currentPeriodEnd: this.stripeTimestamp(subscription?.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end)
      },
      update: {
        planId: payment.planId,
        status: "ACTIVE",
        paymentMode: "STRIPE_SUBSCRIPTION",
        stripeCustomerId: customerId ?? (typeof subscription?.customer === "string" ? subscription.customer : undefined),
        stripeSubscriptionId: subscriptionId,
        currentPeriodStart: this.stripeTimestamp(subscription?.current_period_start),
        currentPeriodEnd: this.stripeTimestamp(subscription?.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
        expiresAt: null
      }
    });
  }

  private accountPaymentAmount(plan: { priceMonthly: Prisma.Decimal }, billingCycle: string, metadata?: Record<string, unknown>) {
    const quotedAmount = typeof metadata?.quotedAmount === "number" ? metadata.quotedAmount : undefined;
    if (quotedAmount !== undefined) return quotedAmount;
    const monthly = Number(plan.priceMonthly);
    return billingCycle === "yearly" ? monthly * 10 : monthly;
  }

  private async assertPlanCheckoutAllowed(
    businessId: string,
    targetPlan: { code: string; name: string; productLimit: number; userLimit: number; branchLimit: number; warehouseLimit: number },
    checkoutMode?: CheckoutMode
  ) {
    const blockReason = await this.planCheckoutBlockReason(this.prisma, businessId, targetPlan, checkoutMode);
    if (blockReason) throw new BadRequestException(blockReason);
  }

  private async planCheckoutBlockReason(
    client: { businessSubscription: { findUnique: (args: any) => Promise<any> } },
    businessId: string,
    targetPlan: { code: string; name: string; productLimit: number; userLimit: number; branchLimit: number; warehouseLimit: number },
    checkoutMode?: CheckoutMode
  ) {
    const currentSubscription = await client.businessSubscription.findUnique({
      where: { businessId },
      include: { plan: true }
    });
    if (!currentSubscription || currentSubscription.status !== "ACTIVE") return undefined;

    const currentRank = this.planRank(currentSubscription.plan);
    const targetRank = this.planRank(targetPlan);
    if (targetRank > currentRank) return undefined;

    const currentName = currentSubscription.plan.name || currentSubscription.plan.code;
    const targetName = targetPlan.name || targetPlan.code;
    if (targetRank === currentRank) {
      const isActivePromptPay = currentSubscription.paymentMode === "PROMPTPAY_ONE_TIME" && currentSubscription.expiresAt && currentSubscription.expiresAt.getTime() > Date.now();
      const isPromptPayRenewal = checkoutMode === "promptpay" && isActivePromptPay;
      const isPromptPayToCard = checkoutMode === "subscription" && isActivePromptPay;
      if (isPromptPayRenewal || isPromptPayToCard) return undefined;
      return `บัญชีนี้ใช้แพ็กเกจ ${currentName} อยู่แล้ว ไม่ต้องชำระ ${targetName} ซ้ำ`;
    }
    return `บัญชีนี้ใช้แพ็กเกจ ${currentName} อยู่แล้ว จึงไม่สามารถชำระแพ็กเกจที่ต่ำกว่าอย่าง ${targetName} ได้`;
  }

  private planRank(plan: { code: string; productLimit: number; userLimit: number; branchLimit: number; warehouseLimit: number }) {
    const fixedRank = PLAN_CODE_RANK[plan.code.toUpperCase()];
    if (fixedRank !== undefined) return fixedRank;
    return plan.productLimit + plan.userLimit * 100_000 + plan.branchLimit * 1_000_000 + plan.warehouseLimit * 1_000_000;
  }

  private paymentReference(planCode: string, billingCycle: string) {
    return `ZT-${Date.now()}-${planCode}-${billingCycle.slice(0, 1).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private stripePriceId(planCode: string, billingCycle: string) {
    if (planCode === "PRO" && billingCycle === "monthly") return process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    if (planCode === "PRO" && billingCycle === "yearly") return process.env.STRIPE_PRO_YEARLY_PRICE_ID;
    return undefined;
  }

  private async createStripeCheckoutSession(user: CurrentUser, payment: any, checkoutMode: "subscription" | "promptpay") {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = this.stripePriceId(payment.planCode, payment.billingCycle);
    if (!secretKey) throw new BadRequestException("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY");
    if (checkoutMode === "subscription" && !priceId) throw new BadRequestException("ยังไม่ได้ตั้งค่า Stripe price สำหรับแพ็กเกจนี้");

    const currentSubscription = payment.businessId
      ? await this.prisma.businessSubscription.findUnique({ where: { businessId: payment.businessId }, include: { plan: true } })
      : null;
    const webAppUrl = (process.env.WEB_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const successUrl = `${webAppUrl}/checkout?plan=${payment.planCode.toLowerCase()}&payment=success&method=${checkoutMode}&reference=${encodeURIComponent(payment.reference)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${webAppUrl}/checkout?plan=${payment.planCode.toLowerCase()}&payment=cancelled&method=${checkoutMode}&reference=${encodeURIComponent(payment.reference)}`;
    const params = new URLSearchParams({
      mode: checkoutMode === "promptpay" ? "payment" : "subscription",
      client_reference_id: payment.reference,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][quantity]": "1",
      "metadata[reference]": payment.reference,
      "metadata[planCode]": payment.planCode,
      "metadata[billingCycle]": payment.billingCycle,
      "metadata[checkoutMode]": checkoutMode,
      "metadata[businessId]": payment.businessId ?? "",
    });
    if (currentSubscription?.stripeCustomerId) {
      params.set("customer", currentSubscription.stripeCustomerId);
    } else {
      params.set("customer_email", user.email);
    }
    const carryoverTrialDays = checkoutMode === "subscription" ? this.promptPayCarryoverTrialDays(currentSubscription, payment.planCode) : undefined;
    if (carryoverTrialDays) {
      params.set("payment_method_collection", "always");
      params.set("metadata[promptPayCarryoverTrialDays]", String(carryoverTrialDays));
    }
    if (checkoutMode === "promptpay") {
      params.set("payment_method_types[0]", "promptpay");
      params.set("line_items[0][price_data][currency]", "thb");
      params.set("line_items[0][price_data][unit_amount]", String(Math.round(Number(payment.amount) * 100)));
      params.set("line_items[0][price_data][product_data][name]", `${payment.plan?.name ?? payment.planCode} ${payment.billingCycle === "yearly" ? "รายปี" : "รายเดือน"}`);
      params.set("line_items[0][price_data][product_data][description]", "ชำระผ่าน PromptPay QR สำหรับเปิดใช้งานแพ็กเกจ Zentory รอบนี้");
    } else {
      params.set("line_items[0][price]", priceId!);
      params.set("subscription_data[metadata][reference]", payment.reference);
      params.set("subscription_data[metadata][planCode]", payment.planCode);
      params.set("subscription_data[metadata][businessId]", payment.businessId ?? "");
      params.set("subscription_data[metadata][checkoutMode]", checkoutMode);
      if (carryoverTrialDays) {
        params.set("subscription_data[trial_period_days]", String(carryoverTrialDays));
        params.set("subscription_data[metadata][promptPayCarryoverTrialDays]", String(carryoverTrialDays));
      }
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });
    const body = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !body.id || !body.url) {
      throw new BadRequestException(body.error?.message ?? "สร้าง Stripe Checkout Session ไม่สำเร็จ");
    }
    return { id: body.id, url: body.url };
  }

  private promptPayCarryoverTrialDays(subscription: any, planCode: string) {
    if (
      subscription?.status !== "ACTIVE" ||
      subscription.paymentMode !== "PROMPTPAY_ONE_TIME" ||
      subscription.plan?.code?.toUpperCase?.() !== planCode.toUpperCase() ||
      !subscription.expiresAt
    ) {
      return undefined;
    }
    const remainingMs = new Date(subscription.expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) return undefined;
    return Math.max(1, Math.min(730, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))));
  }

  private async stripeRequest<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>, method: "GET" | "POST" = "POST") {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new BadRequestException("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY");
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) body.set(key, String(value));
    }
    const url = method === "GET" && body.size > 0
      ? `https://api.stripe.com${path}?${body.toString()}`
      : `https://api.stripe.com${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
      },
      ...(method === "POST" ? { body } : {})
    });
    const json = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new BadRequestException(json.error?.message ?? "Stripe request failed");
    return json;
  }

  private stripeTimestamp(value: unknown) {
    return typeof value === "number" ? new Date(value * 1000) : undefined;
  }

  private periodFromStripeObject(value: any) {
    const linePeriod = value?.lines?.data?.[0]?.period;
    return {
      start: this.stripeTimestamp(value?.period_start) ?? this.stripeTimestamp(linePeriod?.start),
      end: this.stripeTimestamp(value?.period_end) ?? this.stripeTimestamp(linePeriod?.end)
    };
  }

  private stripeSubscriptionIdFromInvoice(invoice: any) {
    if (typeof invoice?.subscription === "string") return invoice.subscription;
    if (typeof invoice?.parent?.subscription_details?.subscription === "string") return invoice.parent.subscription_details.subscription;
    if (typeof invoice?.lines?.data?.[0]?.subscription === "string") return invoice.lines.data[0].subscription;
    return undefined;
  }

  private async freePlan() {
    return this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: "FREE" } });
  }

  private async expirePromptPaySubscriptionIfNeeded(businessId: string) {
    const subscription = await this.prisma.businessSubscription.findUnique({ where: { businessId }, include: { plan: true } });
    if (!subscription) return subscription;
    const now = Date.now();
    const promptPayExpired = subscription.paymentMode === "PROMPTPAY_ONE_TIME" && subscription.expiresAt && subscription.expiresAt.getTime() <= now;
    const canceledSubscriptionExpired = subscription.paymentMode === "STRIPE_SUBSCRIPTION" && subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() <= now;
    if (!promptPayExpired && !canceledSubscriptionExpired) return subscription;
    const freePlan = await this.freePlan();
    return this.prisma.businessSubscription.update({
      where: { businessId },
      data: {
        planId: freePlan.id,
        status: "EXPIRED",
        paymentMode: "FREE",
        cancelAtPeriodEnd: false,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        expiresAt: null,
        stripeSubscriptionId: canceledSubscriptionExpired ? null : subscription.stripeSubscriptionId
      },
      include: { plan: true }
    });
  }

  private serializeAccountPayment(payment: any) {
    return {
      id: payment.id,
      reference: payment.reference,
      planCode: payment.planCode,
      billingCycle: payment.billingCycle,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      checkoutUrl: payment.checkoutUrl,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      plan: payment.plan ? {
        code: payment.plan.code,
        name: payment.plan.name,
        productLimit: payment.plan.productLimit,
        userLimit: payment.plan.userLimit,
        branchLimit: payment.plan.branchLimit,
        warehouseLimit: payment.plan.warehouseLimit
      } : undefined
    };
  }

  private jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private requireBusiness(user: CurrentUser) {
    if (!user.businessId) throw new ForbiddenException("Business context is required");
  }

  private requireSystemAdmin(user: CurrentUser) {
    if (!user.isSystemAdmin) throw new ForbiddenException("System admin permission is required");
  }

  private startOfBangkokDay(date: Date) {
    const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
    return new Date(Date.UTC(bangkokDate.getUTCFullYear(), bangkokDate.getUTCMonth(), bangkokDate.getUTCDate()) - BANGKOK_OFFSET_MS);
  }

  private startOfBangkokMonth(date: Date) {
    const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
    return new Date(Date.UTC(bangkokDate.getUTCFullYear(), bangkokDate.getUTCMonth(), 1) - BANGKOK_OFFSET_MS);
  }

  private daysInBangkokMonth(date: Date) {
    const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
    return new Date(Date.UTC(bangkokDate.getUTCFullYear(), bangkokDate.getUTCMonth() + 1, 0)).getUTCDate();
  }

  private deriveSalesTargets(mode: "ANNUAL" | "MONTHLY" | "DAILY", annual: number | null, monthly: number | null, daily: number | null, daysInCurrentMonth: number) {
    if (mode === "MONTHLY") {
      if (!monthly || monthly <= 0) return { salesTargetMode: mode, annualSalesTarget: null, monthlySalesTarget: null, dailySalesTarget: null };
      return { salesTargetMode: mode, annualSalesTarget: monthly * 12, monthlySalesTarget: monthly, dailySalesTarget: monthly / daysInCurrentMonth };
    }
    if (mode === "DAILY") {
      if (!daily || daily <= 0) return { salesTargetMode: mode, annualSalesTarget: null, monthlySalesTarget: null, dailySalesTarget: null };
      return { salesTargetMode: mode, annualSalesTarget: daily * 365, monthlySalesTarget: daily * daysInCurrentMonth, dailySalesTarget: daily };
    }
    if (!annual || annual <= 0) return { salesTargetMode: mode, annualSalesTarget: null, monthlySalesTarget: null, dailySalesTarget: null };
    const monthlySalesTarget = annual / 12;
    return { salesTargetMode: mode, annualSalesTarget: annual, monthlySalesTarget, dailySalesTarget: monthlySalesTarget / daysInCurrentMonth };
  }

  private bangkokDateKey(date: Date) {
    const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
    return bangkokDate.toISOString().slice(0, 10);
  }

  private buildSalesSeries(start: Date, sales: Array<{ createdAt: Date; total: Prisma.Decimal }>, days = 7) {
    const totals = new Map<string, number>();
    for (const sale of sales) {
      const key = this.bangkokDateKey(sale.createdAt);
      totals.set(key, (totals.get(key) ?? 0) + Number(sale.total));
    }
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
      const dateKey = this.bangkokDateKey(date);
      return { date: dateKey, total: totals.get(dateKey) ?? 0 };
    });
  }

  private buildDashboardSalesTrend(trendStart: Date, weekStart: Date, sales: Array<{ createdAt: Date; total: Prisma.Decimal }>) {
    const series = this.buildSalesSeries(trendStart, sales, 30);
    const total = series.reduce((sum, day) => sum + day.total, 0);
    const last7DaysTotal = sales
      .filter((sale) => sale.createdAt >= weekStart)
      .reduce((sum, sale) => sum + Number(sale.total), 0);
    const previous7Start = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previous7DaysTotal = sales
      .filter((sale) => sale.createdAt >= previous7Start && sale.createdAt < weekStart)
      .reduce((sum, sale) => sum + Number(sale.total), 0);
    const bestDay = series.reduce<{ date: string; total: number } | null>((best, day) => {
      if (day.total <= 0) return best;
      if (!best || day.total > best.total) return day;
      return best;
    }, null);

    return {
      total,
      averageDailySales: total / 30,
      receiptCount: sales.length,
      last7DaysTotal,
      previous7DaysTotal,
      last7DaysChangePercent: this.percentChange(last7DaysTotal, previous7DaysTotal),
      bestDay
    };
  }

  private targetProgress(current: number, target: number | null) {
    if (!target || target <= 0) return { target, current, percent: null, remaining: null, reached: false };
    const percent = Math.round((current / target) * 100);
    return {
      target,
      current,
      percent,
      remaining: Math.max(target - current, 0),
      reached: current >= target
    };
  }

  private percentChange(current: number, previous: number) {
    if (previous <= 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private sumGrossProfit(items: Array<{ quantity: number; total: Prisma.Decimal; unitCost: Prisma.Decimal }>) {
    return items.reduce((sum, item) => sum + Number(item.total) - Number(item.unitCost) * item.quantity, 0);
  }

  private summarizeTopProducts(
    items: Array<{ quantity: number; total: Prisma.Decimal; unitCost: Prisma.Decimal; product: { id: string; name: string; sku: string } }>
  ) {
    const summaries = new Map<string, { productId: string; name: string; sku: string; quantity: number; revenue: number; grossProfit: number }>();
    for (const item of items) {
      const current = summaries.get(item.product.id) ?? {
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        quantity: 0,
        revenue: 0,
        grossProfit: 0
      };
      current.quantity += item.quantity;
      current.revenue += Number(item.total);
      current.grossProfit += Number(item.total) - Number(item.unitCost) * item.quantity;
      summaries.set(item.product.id, current);
    }
    return [...summaries.values()].sort((left, right) => right.revenue - left.revenue).slice(0, 5);
  }

  private serializeMember(member: { role: RoleName; permissionOverrides: unknown; [key: string]: unknown }) {
    const permissionOverrides = normalizePermissionOverrides(member.permissionOverrides);
    const branchAssignments = Array.isArray(member.branchAssignments) ? member.branchAssignments as Array<{ branch?: unknown }> : [];
    const assignedBranches = branchAssignments
      .map((assignment) => assignment.branch)
      .filter(Boolean);
    const { branchAssignments: _branchAssignments, ...memberData } = member;
    return {
      ...memberData,
      assignedBranches,
      permissionOverrides,
      effectivePermissions: resolveEffectivePermissions(member.role as Role, permissionOverrides)
    };
  }

  private async validateMemberBranchIds(businessId: string, branchIds: string[]) {
    const uniqueBranchIds = [...new Set(branchIds.map((branchId) => branchId.trim()).filter(Boolean))];
    if (uniqueBranchIds.length === 0) return [];
    const branches = await this.prisma.branch.findMany({
      where: { businessId, id: { in: uniqueBranchIds }, status: "ACTIVE" as any },
      select: { id: true }
    });
    if (branches.length !== uniqueBranchIds.length) throw new BadRequestException("พบสาขาที่ไม่พร้อมใช้งานหรือไม่ได้อยู่ในร้านนี้");
    return uniqueBranchIds;
  }

  private async assertMemberBranchSelectionAccess(user: CurrentUser, branchIds: string[]) {
    const allowedBranchIds = await this.getAccessibleBranchIds(user);
    if (!allowedBranchIds) return;
    if (branchIds.some((branchId) => !allowedBranchIds.includes(branchId))) {
      throw new ForbiddenException("Branch is not assigned to this user");
    }
  }

  private async assertEditableMember(user: CurrentUser, id: string, ownerMessage: string) {
    const member = await this.prisma.businessMember.findFirst({
      where: { id, businessId: user.businessId },
      include: { requestedBranch: true, branchAssignments: { include: { branch: true } } }
    });
    if (!member) throw new NotFoundException("Member not found");
    if (member.role === "OWNER") throw new BadRequestException(ownerMessage);
    const allowedBranchIds = await this.getAccessibleBranchIds(user);
    if (!this.isMemberInBranchScope(member, allowedBranchIds, allowedBranchIds ? await this.memberBranchTokens(user.businessId!, allowedBranchIds) : undefined)) {
      throw new ForbiddenException("Branch is not assigned to this user");
    }
    return member;
  }

  private async memberBranchTokens(businessId: string, branchIds: string[]) {
    if (branchIds.length === 0) return new Set<string>();
    const branches = await this.prisma.branch.findMany({
      where: { businessId, id: { in: branchIds }, status: "ACTIVE" as any },
      select: { id: true, name: true, code: true }
    });
    return new Set(branches.flatMap((branch) => [branch.id, branch.name, branch.code].map((value) => this.normalizeMemberBranchText(value)).filter(Boolean) as string[]));
  }

  private isMemberInBranchScope(
    member: { status?: string | null; preferredBranch?: string | null; requestedBranchId?: string | null; requestedBranch?: { id?: string | null } | null; branchAssignments?: Array<{ branchId?: string | null; branch?: { id?: string | null } | null }> },
    allowedBranchIds?: string[],
    branchTokens?: Set<string>
  ) {
    if (!allowedBranchIds) return true;
    if (allowedBranchIds.length === 0) return false;
    if (member.status === "PENDING") {
      const requestedBranchId = member.requestedBranchId ?? member.requestedBranch?.id ?? "";
      if (requestedBranchId && allowedBranchIds.includes(requestedBranchId)) return true;
      const preferredBranch = this.normalizeMemberBranchText(member.preferredBranch);
      return Boolean(preferredBranch && branchTokens?.has(preferredBranch));
    }
    return (member.branchAssignments ?? []).some((assignment) => {
      const branchId = assignment.branchId ?? assignment.branch?.id ?? "";
      return allowedBranchIds.includes(branchId);
    });
  }

  private normalizeMemberBranchText(value?: string | null) {
    return value?.trim().toLocaleLowerCase("th-TH") || "";
  }

  private branchWriteData(dto: Partial<BranchDto>) {
    const data: Record<string, string | null> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) data.code = this.normalizeBranchCode(dto.code);
    if (dto.status !== undefined) {
      if (!BRANCH_STATUSES.includes(dto.status)) throw new BadRequestException("Invalid branch status");
      data.status = dto.status;
    }
    if (dto.address !== undefined) data.address = this.optionalText(dto.address);
    if (dto.contactName !== undefined) data.contactName = this.optionalText(dto.contactName);
    if (dto.contactPhone !== undefined) data.contactPhone = this.optionalText(dto.contactPhone);
    if (dto.note !== undefined) data.note = this.optionalText(dto.note);
    return data;
  }

  private warehouseWriteData(dto: Partial<WarehouseDto>) {
    const data: Record<string, string | null> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) data.code = this.normalizeBranchCode(dto.code);
    if (dto.branchId !== undefined) data.branchId = dto.branchId;
    if (dto.type !== undefined) {
      if (!WAREHOUSE_TYPES.includes(dto.type)) throw new BadRequestException("Invalid warehouse type");
      data.type = dto.type;
    }
    if (dto.status !== undefined) {
      if (!WAREHOUSE_STATUSES.includes(dto.status)) throw new BadRequestException("Invalid warehouse status");
      data.status = dto.status;
    }
    if (dto.address !== undefined) data.address = this.optionalText(dto.address);
    if (dto.contactName !== undefined) data.contactName = this.optionalText(dto.contactName);
    if (dto.contactPhone !== undefined) data.contactPhone = this.optionalText(dto.contactPhone);
    if (dto.note !== undefined) data.note = this.optionalText(dto.note);
    return data;
  }

  private categoryWriteData(dto: Partial<CategoryDto>) {
    const data: { name?: string; color?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.color !== undefined) data.color = dto.color.trim() || "#2563eb";
    return data;
  }

  private normalizeBranchCode(code: string) {
    return code.trim().toUpperCase().replace(/\s+/g, "-");
  }

  private optionalText(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private async assertCanDeactivateBranch(businessId: string, branch: { id: string; isDefault?: boolean; status?: string }) {
    if (branch.status === "INACTIVE") return;
    const activeBranches = await this.prisma.branch.count({ where: { businessId, status: "ACTIVE" as any } });
    if (activeBranches <= 1) throw new BadRequestException("ต้องมีสาขาที่เปิดใช้งานอย่างน้อย 1 สาขา");
  }

  private async assertCanDeactivateWarehouse(businessId: string, warehouse: { id: string; branchId: string; isDefault?: boolean; status?: string }) {
    if (warehouse.status === "INACTIVE") return;
    if (warehouse.isDefault) {
      const stock = await this.prisma.inventoryBalance.aggregate({
        where: { businessId, warehouseId: warehouse.id },
        _sum: { quantity: true }
      });
      if ((stock._sum.quantity ?? 0) > 0) throw new BadRequestException("ไม่สามารถปิดใช้งานคลังหลักที่ยังมีสต็อกอยู่");
    }
    await this.assertBranchKeepsActiveWarehouse(businessId, warehouse.branchId, warehouse.id);
  }

  private async assertCanDeleteWarehouse(
    businessId: string,
    warehouse: {
      id: string;
      branchId: string;
      isDefault?: boolean;
      status?: string;
      _count: { balances: number; movements: number; receipts: number; adjustments: number; sales: number };
    }
  ) {
    if (warehouse.isDefault) throw new BadRequestException("ไม่สามารถลบคลังหลักได้ กรุณาปิดใช้งานแทน");
    const totalWarehouses = await this.prisma.warehouse.count({ where: { businessId } });
    if (totalWarehouses <= 1) throw new BadRequestException("ต้องมีคลังอย่างน้อย 1 คลัง");
    if (warehouse.status === "ACTIVE") await this.assertBranchKeepsActiveWarehouse(businessId, warehouse.branchId, warehouse.id);
    const hasHistory =
      warehouse._count.balances > 0 ||
      warehouse._count.movements > 0 ||
      warehouse._count.receipts > 0 ||
      warehouse._count.adjustments > 0 ||
      warehouse._count.sales > 0;
    if (hasHistory) throw new BadRequestException("คลังนี้มีสต็อกหรือประวัติรายการแล้ว กรุณาปิดใช้งานแทนการลบ");
  }

  private async assertBranchKeepsActiveWarehouse(businessId: string, branchId: string, excludingWarehouseId: string) {
    const branchDelegate = (this.prisma as any).branch;
    if (branchDelegate?.findFirst) {
      const branch = await branchDelegate.findFirst({ where: { id: branchId, businessId } });
      if (!branch || branch.status === "INACTIVE") return;
    }
    const activeWarehouses = await this.prisma.warehouse.count({
      where: {
        businessId,
        branchId,
        status: "ACTIVE" as any,
        id: { not: excludingWarehouseId }
      }
    });
    if (activeWarehouses <= 0) throw new BadRequestException("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลังในสาขานี้");
  }

  private async defaultBranch(businessId: string) {
    return this.prisma.branch.findFirstOrThrow({ where: { businessId, isDefault: true } });
  }

  private async defaultWarehouse(businessId: string, branchId?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { businessId, ...(branchId ? { branchId } : {}), isDefault: true, status: "ACTIVE" as any },
      include: { branch: true }
    });
    if (warehouse) return warehouse;
    return this.prisma.warehouse.findFirstOrThrow({
      where: { businessId, ...(branchId ? { branchId } : {}), status: "ACTIVE" as any },
      include: { branch: true },
      orderBy: { createdAt: "asc" }
    });
  }

  private async resolveWarehouse(businessId: string, branchId?: string, warehouseId?: string) {
    if (warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, businessId }, include: { branch: true } });
      if (!warehouse) throw new BadRequestException("Warehouse is not available for this business");
      if (branchId && warehouse.branchId !== branchId) throw new BadRequestException("Warehouse does not belong to the selected branch");
      if (warehouse.status !== "ACTIVE") throw new BadRequestException("Warehouse is inactive");
      return warehouse;
    }
    return this.defaultWarehouse(businessId, branchId);
  }

  private async resolveWarehouseWithClient(tx: Prisma.TransactionClient, businessId: string, warehouseId: string, branchId?: string) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, businessId }, include: { branch: true } });
    if (!warehouse) throw new BadRequestException("Warehouse is not available for this business");
    if (branchId && warehouse.branchId !== branchId) throw new BadRequestException("Warehouse does not belong to the selected branch");
    if (warehouse.status !== "ACTIVE") throw new BadRequestException("Warehouse is inactive");
    if (warehouse.branch.status !== "ACTIVE") throw new BadRequestException("Branch is inactive");
    return warehouse;
  }

  private async findTransferForWrite(tx: Prisma.TransactionClient, businessId: string, id: string) {
    const transfer = await tx.stockTransfer.findFirst({
      where: { id, businessId },
      include: { items: true }
    });
    if (!transfer) throw new NotFoundException("Transfer not found");
    return transfer;
  }

  private async resolveSaleLocation(businessId: string, branchId?: string, warehouseId?: string) {
    const branch = branchId
      ? await this.assertBranch(businessId, branchId)
      : await this.defaultBranch(businessId);
    const warehouse = warehouseId
      ? await this.resolveWarehouse(businessId, branch.id, warehouseId)
      : await this.defaultSaleWarehouse(businessId, branch.id);
    return { branch, warehouse };
  }

  private async defaultSaleWarehouse(businessId: string, branchId: string) {
    const storeFront = await this.prisma.warehouse.findFirst({
      where: { businessId, branchId, type: "STORE_FRONT" as any, status: "ACTIVE" as any },
      include: { branch: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });
    return storeFront ?? this.defaultWarehouse(businessId, branchId);
  }

  private buildSalesWhere(businessId: string, query: SaleListQueryDto = {}, locationWhere: Prisma.SaleWhereInput = {}): Prisma.SaleWhereInput {
    const term = query.q?.trim();
    const where: Prisma.SaleWhereInput = {
      businessId,
      ...locationWhere,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.status ? { status: query.status } : {})
    };

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {})
      };
    }

    if (term) {
      where.OR = [
        { receiptNo: { contains: term, mode: "insensitive" } },
        { branch: { name: { contains: term, mode: "insensitive" } } },
        { warehouse: { name: { contains: term, mode: "insensitive" } } },
        { user: { name: { contains: term, mode: "insensitive" } } },
        { items: { some: { product: { name: { contains: term, mode: "insensitive" } } } } },
        { items: { some: { product: { sku: { contains: term, mode: "insensitive" } } } } }
      ];
    }

    return where;
  }

  private toCsv(rows: string[][]) {
    const body = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    return `\uFEFF${body}\n`;
  }

  private stockCountDetailInclude() {
    return {
      warehouse: { include: { branch: true } },
      user: { select: { id: true, name: true } },
      items: { include: { product: { include: { category: true, brand: true } } } }
    } satisfies Prisma.StockCountInclude;
  }

  private stockCountSummary(items: Array<{ countedQuantity: number | null; difference: number | null }>) {
    const countedItems = items.filter((item) => item.countedQuantity !== null).length;
    const differentItems = items.filter((item) => item.difference !== null && item.difference !== 0).length;
    const increaseQuantity = items.reduce((sum, item) => sum + Math.max(item.difference ?? 0, 0), 0);
    const decreaseQuantity = items.reduce((sum, item) => sum + Math.abs(Math.min(item.difference ?? 0, 0)), 0);
    return {
      totalItems: items.length,
      countedItems,
      uncountedItems: items.length - countedItems,
      differentItems,
      increaseQuantity,
      decreaseQuantity
    };
  }

  private stockCountListRow(count: any) {
    const { items, ...rest } = count;
    return { ...rest, summary: this.stockCountSummary(items) };
  }

  private stockCountDetail(count: any) {
    const items = [...count.items].sort((left, right) => {
      const category = (left.product.category?.name ?? "").localeCompare(right.product.category?.name ?? "", "th");
      if (category !== 0) return category;
      return left.product.name.localeCompare(right.product.name, "th");
    });
    return { ...count, items, summary: this.stockCountSummary(items) };
  }

  private async assertLocationFilters(businessId: string, filters: LocationFilters) {
    if (filters.branchId) await this.assertBranch(businessId, filters.branchId);
    if (!filters.warehouseId) return;
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: filters.warehouseId, businessId } });
    if (!warehouse) throw new BadRequestException("Warehouse is not available for this business");
    if (warehouse.status !== "ACTIVE") throw new BadRequestException("Warehouse is inactive");
    if (filters.branchId && warehouse.branchId !== filters.branchId) throw new BadRequestException("Warehouse does not belong to the selected branch");
  }

  private async assertBranch(businessId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, businessId } });
    if (!branch) throw new BadRequestException("Branch is not available for this business");
    if (branch.status !== "ACTIVE") throw new BadRequestException("Branch is inactive");
    return branch;
  }

  private async addStock(tx: Prisma.TransactionClient, businessId: string, warehouseId: string, productId: string, quantity: number, allowedStatuses: readonly string[] = PRODUCT_STOCK_ADJUSTMENT_STATUSES) {
    await this.assertProduct(tx, businessId, productId, allowedStatuses);
    const current = await tx.inventoryBalance.findUnique({ where: { businessId_warehouseId_productId: { businessId, warehouseId, productId } } });
    const balanceBefore = current?.quantity ?? 0;
    const balance = await tx.inventoryBalance.upsert({
      where: { businessId_warehouseId_productId: { businessId, warehouseId, productId } },
      create: { businessId, warehouseId, productId, quantity },
      update: { quantity: { increment: quantity } }
    });
    return { ...balance, balanceBefore };
  }

  private async removeStock(tx: Prisma.TransactionClient, businessId: string, warehouseId: string, productId: string, quantity: number, allowedStatuses: readonly string[] = PRODUCT_STOCK_ADJUSTMENT_STATUSES) {
    await this.assertProduct(tx, businessId, productId, allowedStatuses);
    const result = await tx.inventoryBalance.updateMany({
      where: { businessId, warehouseId, productId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } }
    });
    if (result.count !== 1) throw new BadRequestException("Insufficient stock");
    const balance = await tx.inventoryBalance.findUniqueOrThrow({ where: { businessId_warehouseId_productId: { businessId, warehouseId, productId } } });
    return { ...balance, balanceBefore: balance.quantity + quantity };
  }

  private async assertProduct(tx: Prisma.TransactionClient, businessId: string, productId: string, allowedStatuses: readonly string[]) {
    const product = await tx.product.findFirst({ where: { id: productId, businessId, status: { in: allowedStatuses as any } } });
    if (!product) throw new BadRequestException("Product is not available for this operation");
  }

  private async createReceiptProduct(tx: Prisma.TransactionClient, businessId: string, dto: ReceiptNewProductDto, unitCost: number) {
    const categoryId = dto.categoryName ? (await this.upsertCategoryWithClient(tx, businessId, dto.categoryName)).id : undefined;
    const brandId = dto.brandName ? (await this.upsertBrandWithClient(tx, businessId, dto.brandName)).id : undefined;
    return tx.product.create({
      data: {
        businessId,
        categoryId,
        brandId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        description: dto.description,
        unit: dto.unit ?? "ชิ้น",
        costPrice: unitCost,
        salePrice: dto.salePrice,
        minStock: dto.minStock
      }
    });
  }

  private async createProductRecord(tx: Prisma.TransactionClient, businessId: string, dto: ProductDto) {
    const categoryId = dto.categoryName ? (await this.upsertCategoryWithClient(tx, businessId, dto.categoryName)).id : undefined;
    const brandId = dto.brandName ? (await this.upsertBrandWithClient(tx, businessId, dto.brandName)).id : undefined;
    return tx.product.create({
      data: {
        businessId,
        categoryId,
        brandId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        description: dto.description,
        unit: dto.unit ?? "ชิ้น",
        costPrice: dto.costPrice,
        salePrice: dto.salePrice,
        minStock: dto.minStock
      }
    });
  }

  private async nextDocumentNo(tx: Prisma.TransactionClient, businessId: string, prefix: string) {
    void tx;
    void businessId;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `${prefix}-${today}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private upsertCategory(businessId: string, name: string) {
    return this.prisma.category.upsert({
      where: { businessId_name: { businessId, name } },
      create: { businessId, name },
      update: {}
    });
  }

  private upsertCategoryWithClient(tx: Prisma.TransactionClient, businessId: string, name: string) {
    return tx.category.upsert({
      where: { businessId_name: { businessId, name } },
      create: { businessId, name },
      update: {}
    });
  }

  private upsertBrand(businessId: string, name: string) {
    return this.prisma.brand.upsert({
      where: { businessId_name: { businessId, name } },
      create: { businessId, name },
      update: {}
    });
  }

  private upsertBrandWithClient(tx: Prisma.TransactionClient, businessId: string, name: string) {
    return tx.brand.upsert({
      where: { businessId_name: { businessId, name } },
      create: { businessId, name },
      update: {}
    });
  }

  private uniqueTrimmedValues(values: string[], emptyMessage: string) {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const rawValue of values) {
      const value = rawValue.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    if (result.length === 0) throw new BadRequestException(emptyMessage);
    return result;
  }

  private variantKey(color: string, size: string) {
    return `${color.trim().toLowerCase()}\u0000${size.trim().toLowerCase()}`;
  }

  private assertNoDuplicateValues(values: string[], message: string) {
    const seen = new Set<string>();
    for (const value of values) {
      const key = value.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) throw new BadRequestException(message);
      seen.add(key);
    }
  }

  private async assertVariantCodesAvailable(businessId: string, skus: string[], barcodes: string[]) {
    const existing = await this.prisma.product.findMany({
      where: {
        businessId,
        OR: [
          { sku: { in: skus } },
          ...(barcodes.length > 0 ? [{ barcode: { in: barcodes } }] : [])
        ]
      },
      select: { sku: true, barcode: true }
    });
    if (existing.some((product) => skus.includes(product.sku))) throw new BadRequestException("SKU นี้ถูกใช้แล้ว กรุณาใช้ SKU อื่น");
    if (existing.some((product) => product.barcode && barcodes.includes(product.barcode))) throw new BadRequestException("Barcode นี้ถูกใช้แล้ว กรุณาใช้ barcode อื่น");
  }

  async getUsedProductLimit(businessId: string) {
    const products = await this.prisma.product.findMany({
      where: { businessId, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } },
      include: { balances: true }
    });
    return products.filter((product) => this.isProductCountedInLimit(product)).length;
  }

  async canArchiveProduct(businessId: string, productId: string) {
    const stock = await this.prisma.inventoryBalance.aggregate({
      where: { businessId, productId },
      _sum: { quantity: true }
    });
    const stockQuantity = stock._sum.quantity ?? 0;
    const reasons = stockQuantity > 0 ? [`ยังมีสต็อกเหลือ ${stockQuantity}`] : [];
    return { allowed: reasons.length === 0, reasons, stockQuantity, reservedStock: 0, pendingTransactions: 0 };
  }

  private async enforceProductLimit(businessId: string) {
    const subscription = await this.expirePromptPaySubscriptionIfNeeded(businessId);
    const productCount = await this.getUsedProductLimit(businessId);
    if (subscription && productCount >= subscription.plan.productLimit) throw new BadRequestException(PRODUCT_LIMIT_ERROR);
  }

  private async enforceProductLimitForNewProducts(businessId: string, newProductCount: number) {
    if (newProductCount <= 0) return;
    const subscription = await this.expirePromptPaySubscriptionIfNeeded(businessId);
    if (!subscription) return;
    const productCount = await this.getUsedProductLimit(businessId);
    if (productCount + newProductCount > subscription.plan.productLimit) throw new BadRequestException(PRODUCT_LIMIT_ERROR);
  }

  private productListStatuses(status?: string) {
    if (!status) return PRODUCT_MANAGEMENT_STATUSES;
    const requested = status.split(",").map((item) => item.trim()).filter(Boolean);
    const allowed = new Set(["ACTIVE", "PAUSED", "DISCONTINUED", "ARCHIVED"]);
    if (requested.length && requested.every((item) => allowed.has(item))) return requested;
    throw new BadRequestException("Invalid product status filter");
  }

  private productBaseStatusesForBranchList(statuses: readonly string[]) {
    if (statuses.length === 1 && statuses[0] === "ARCHIVED") return ["ARCHIVED"];
    return PRODUCT_MANAGEMENT_STATUSES;
  }

  private applyProductBranchStatuses(products: any[], branchId?: string): any[] {
    return products.map((product) => this.applyProductBranchStatus(product, branchId));
  }

  private applyProductBranchStatus(product: any, branchId?: string): any {
    const branchStatus = branchId && product.status !== "ARCHIVED" ? product.branchStatuses?.[0]?.status : undefined;
    return { ...product, status: branchStatus ?? product.status };
  }

  private isProductCountedInLimit(product: { status: string; balances?: Array<{ quantity: number }> }) {
    if (product.status === "ACTIVE" || product.status === "PAUSED") return true;
    if (product.status === "DISCONTINUED") return (product.balances ?? []).reduce((sum, balance) => sum + balance.quantity, 0) > 0;
    return false;
  }

  private canCreateProductsFromReceipt(user: CurrentUser) {
    return Boolean(user.isSystemAdmin || user.role === "OWNER");
  }

  private canReceiveInventory(user: CurrentUser) {
    return Boolean(user.isSystemAdmin || hasPermission(user.role as Role, user.permissionOverrides, "inventory.receive"));
  }

  private assertTransferManagerRole(user: CurrentUser) {
    if (user.isSystemAdmin || user.role === "OWNER" || user.role === "MANAGER" || user.role === "BRANCH_MANAGER") return;
    throw new ForbiddenException("Requires manager permission");
  }

  private async ensureMissingBranchDefaultWarehouses(businessId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { businessId, status: "ACTIVE" as any, warehouses: { none: {} } },
      select: { id: true, code: true, name: true }
    });
    if (branches.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      for (const branch of branches) await this.ensureBranchDefaultWarehouse(tx, businessId, branch);
    });
  }

  private async ensureBranchDefaultWarehouse(tx: Prisma.TransactionClient, businessId: string, branch: { id: string; code: string; name: string }) {
    const existing = await tx.warehouse.findFirst({ where: { businessId, branchId: branch.id }, select: { id: true } });
    if (existing) return existing;
    const code = await this.nextWarehouseCode(tx, businessId, `WH-${branch.code}`);
    return tx.warehouse.create({
      data: {
        businessId,
        branchId: branch.id,
        name: "หน้าร้าน",
        code,
        type: "STORE_FRONT" as any,
        status: "ACTIVE" as any,
        isDefault: true
      }
    });
  }

  private async nextWarehouseCode(tx: Prisma.TransactionClient, businessId: string, baseCode: string) {
    const normalizedBase = baseCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-") || "WH";
    let candidate = normalizedBase;
    for (let index = 2; index < 1000; index += 1) {
      const existing = await tx.warehouse.findFirst({ where: { businessId, code: candidate }, select: { id: true } });
      if (!existing) return candidate;
      candidate = `${normalizedBase}-${index}`;
    }
    return `${normalizedBase}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  private async updateProductStatus(user: CurrentUser, product: { id: string; status: string }, status: string, action: string, branchId?: string) {
    let updated: { id: string; status: string };
    if (branchId && status !== "ARCHIVED") {
      const branch = await this.assertBranchAccess(user, branchId);
      await (this.prisma as any).productBranchStatus.upsert({
        where: { businessId_productId_branchId: { businessId: user.businessId!, productId: product.id, branchId: branch.id } },
        create: { businessId: user.businessId!, productId: product.id, branchId: branch.id, status },
        update: { status }
      });
      updated = { ...product, status };
    } else {
      updated = await this.prisma.product.update({ where: { id: product.id }, data: { status: status as any } });
    }
    await this.prisma.auditLog?.create?.({
      data: {
        businessId: user.businessId,
        userId: user.userId,
        action,
        entity: "Product",
        entityId: product.id,
        before: { status: product.status, branchId: branchId ?? null },
        after: { status, branchId: branchId ?? null }
      }
    });
    return updated;
  }

  private async auditProductUpdate(user: CurrentUser, beforeProduct: Record<string, any>, after: Record<string, any>) {
    await this.prisma.auditLog?.create?.({
      data: {
        businessId: user.businessId,
        userId: user.userId,
        action: "product.update",
        entity: "Product",
        entityId: beforeProduct.id,
        before: this.productAuditSnapshot(beforeProduct),
        after: this.productAuditSnapshot({ ...beforeProduct, ...after })
      }
    });
  }

  private productAuditSnapshot(product: Record<string, any>) {
    return {
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? null,
      description: product.description ?? null,
      categoryId: product.categoryId ?? null,
      brandId: product.brandId ?? null,
      unit: product.unit,
      costPrice: product.costPrice === undefined ? undefined : Number(product.costPrice),
      salePrice: product.salePrice === undefined ? undefined : Number(product.salePrice),
      minStock: product.minStock
    };
  }

  private async enforceUserLimit(businessId: string) {
    const subscription = await this.expirePromptPaySubscriptionIfNeeded(businessId);
    const memberCount = await this.prisma.businessMember.count({ where: { businessId, status: "ACTIVE" } });
    if (subscription && memberCount >= subscription.plan.userLimit) throw new BadRequestException("User limit reached for current plan");
  }

  private async enforceBranchLimit(businessId: string) {
    const subscription = await this.expirePromptPaySubscriptionIfNeeded(businessId);
    const branchCount = await this.prisma.branch.count({ where: { businessId } });
    if (subscription && branchCount >= subscription.plan.branchLimit) {
      throw new BadRequestException(`แพ็กเกจ ${subscription.plan.name} เพิ่มสาขาได้สูงสุด ${subscription.plan.branchLimit} สาขา กรุณาอัปเกรดแพ็กเกจเพื่อเพิ่มสาขา`);
    }
  }

  private async enforceWarehouseLimit(businessId: string) {
    const subscription = await this.expirePromptPaySubscriptionIfNeeded(businessId);
    const warehouseCount = await this.prisma.warehouse.count({ where: { businessId } });
    if (subscription && warehouseCount >= subscription.plan.warehouseLimit) {
      throw new BadRequestException(`แพ็กเกจ ${subscription.plan.name} เพิ่มคลังได้สูงสุด ${subscription.plan.warehouseLimit} คลัง กรุณาอัปเกรดแพ็กเกจเพื่อเพิ่มคลัง`);
    }
  }

  private handleBranchWriteError(error: unknown): never {
    if (this.isUniqueConstraintError(error)) {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "";
      if (target.includes("code")) throw new BadRequestException(BRANCH_CODE_DUPLICATE_ERROR);
    }
    throw error;
  }

  private handleWarehouseWriteError(error: unknown): never {
    if (this.isUniqueConstraintError(error)) {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "";
      if (target.includes("code")) throw new BadRequestException(WAREHOUSE_CODE_DUPLICATE_ERROR);
    }
    throw error;
  }

  private handleCategoryWriteError(error: unknown): never {
    if (this.isUniqueConstraintError(error)) {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "";
      if (target.includes("name")) throw new BadRequestException("ชื่อหมวดหมู่นี้มีอยู่แล้ว");
    }
    throw error;
  }

  private normalizeProgress(progress: unknown) {
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return {};
    return progress as Record<string, boolean>;
  }

  private handleProductWriteError(error: unknown): never {
    if (this.isUniqueConstraintError(error)) {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "";
      if (target.includes("sku")) throw new BadRequestException("SKU นี้ถูกใช้แล้ว กรุณาใช้ SKU อื่น");
      if (target.includes("barcode")) throw new BadRequestException("Barcode นี้ถูกใช้แล้ว กรุณาใช้ barcode อื่น");
      throw new BadRequestException("ข้อมูลสินค้าซ้ำกับรายการที่มีอยู่แล้ว");
    }
    throw error;
  }

  private isUniqueConstraintError(error: unknown): error is { code: string; meta?: { target?: unknown } } {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
  }

  private async mergeOnboardingProgress(businessId: string, next: Record<string, boolean>) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { onboardingProgress: true }
    });
    const onboardingProgress = { ...this.normalizeProgress(business.onboardingProgress), ...next };
    await this.prisma.business.update({
      where: { id: businessId },
      data: { onboardingProgress: onboardingProgress as Prisma.InputJsonObject }
    });
  }
}
