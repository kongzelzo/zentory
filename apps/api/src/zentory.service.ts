import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RoleName } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { AdjustmentDto, BranchDto, BusinessDto, MemberDto, ProductDto, ReceiptDto, SaleDto } from "./common/dto";
import { CurrentUser } from "./common/current-user.decorator";
import { PrismaService } from "./prisma/prisma.service";
import { ProductImageFile, ProductImageStorageService } from "./products/product-image-storage.service";

const PRODUCT_LIMIT_ERROR = "แพ็กเกจของคุณถึงขีดจำกัดจำนวนสินค้าแล้ว กรุณาปิด/เก็บสินค้าอื่นก่อน หรืออัปเกรดแพ็กเกจ";
const PRODUCT_MANAGEMENT_STATUSES = ["ACTIVE", "PAUSED", "DISCONTINUED"] as const;
const PRODUCT_STOCK_RECEIPT_STATUSES = ["ACTIVE", "PAUSED"] as const;
const PRODUCT_STOCK_ADJUSTMENT_STATUSES = ["ACTIVE", "PAUSED", "DISCONTINUED"] as const;
const BRANCH_CODE_DUPLICATE_ERROR = "รหัสคลังนี้ถูกใช้แล้ว";
const BRANCH_TYPES = ["MAIN_WAREHOUSE", "STORE_FRONT", "BRANCH", "SECONDARY_WAREHOUSE"] as const;
const BRANCH_STATUSES = ["ACTIVE", "INACTIVE"] as const;

@Injectable()
export class ZentoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productImageStorage: ProductImageStorageService = new ProductImageStorageService()
  ) {}

  async currentBusiness(user: CurrentUser) {
    this.requireBusiness(user);
    return this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
      include: { subscription: { include: { plan: true } }, branches: true }
    });
  }

  async listBranches(user: CurrentUser) {
    this.requireBusiness(user);
    return this.prisma.branch.findMany({
      where: { businessId: user.businessId },
      include: {
        balances: { where: { product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } }, include: { product: true } },
        movements: { take: 10, orderBy: { createdAt: "desc" }, include: { product: true, user: { select: { id: true, name: true } } } }
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });
  }

  async getBranch(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const branch = await this.prisma.branch.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        balances: { where: { product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } }, include: { product: true }, orderBy: { updatedAt: "desc" } },
        movements: { take: 50, orderBy: { createdAt: "desc" }, include: { product: true, user: { select: { id: true, name: true } } } }
      }
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
      return await this.prisma.branch.create({
        data: {
          businessId: user.businessId!,
          name: data.name as string,
          code: data.code as string,
          type: (data.type ?? "BRANCH") as any,
          status: (data.status ?? "ACTIVE") as any,
          address: data.address,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          note: data.note
        }
      });
    } catch (error) {
      this.handleBranchWriteError(error);
    }
  }

  async updateBranch(user: CurrentUser, id: string, dto: Partial<BranchDto>) {
    this.requireBusiness(user);
    const branch = await this.prisma.branch.findFirst({ where: { id, businessId: user.businessId } });
    if (!branch) throw new NotFoundException("Branch not found");
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

  async updateBusiness(user: CurrentUser, dto: Partial<BusinessDto>) {
    this.requireBusiness(user);
    const { setupMode: _setupMode, ...data } = dto;
    return this.prisma.business.update({
      where: { id: user.businessId },
      data
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

  async listProducts(user: CurrentUser, query = "", status?: string) {
    this.requireBusiness(user);
    const statuses = this.productListStatuses(status);
    return this.prisma.product.findMany({
      where: {
        businessId: user.businessId,
        status: { in: statuses as any },
        OR: query
          ? [{ name: { contains: query, mode: "insensitive" } }, { sku: { contains: query, mode: "insensitive" } }, { barcode: { contains: query } }]
          : undefined
      },
      include: { category: true, brand: true, balances: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async createProduct(user: CurrentUser, dto: ProductDto) {
    if ((dto.initialStock ?? 0) > 0) return this.createProductWithInitialStock(user, dto);
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

  async getProduct(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const product = await this.prisma.product.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        category: true,
        brand: true,
        balances: { include: { branch: true } },
        movements: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true } }, branch: true }
        }
      }
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  private async createProductWithInitialStock(user: CurrentUser, dto: ProductDto) {
    this.requireBusiness(user);
    await this.enforceProductLimit(user.businessId!);
    const categoryId = dto.categoryName ? (await this.upsertCategory(user.businessId!, dto.categoryName)).id : undefined;
    const brandId = dto.brandName ? (await this.upsertBrand(user.businessId!, dto.brandName)).id : undefined;
    const branch = await this.defaultBranch(user.businessId!);
    try {
      return await this.prisma.$transaction(async (tx) => {
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
        const stockChange = await this.addStock(tx, user.businessId!, branch.id, product.id, dto.initialStock!);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            branchId: branch.id,
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
    } catch (error) {
      this.handleProductWriteError(error);
    }
  }

  async updateProduct(user: CurrentUser, id: string, dto: Partial<ProductDto>) {
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    if (product.status === "ARCHIVED") throw new BadRequestException("Archived products cannot be edited");
    if ((dto as { status?: string }).status === "ARCHIVED") throw new BadRequestException("Use archive action to archive products");
    const categoryId = dto.categoryName ? (await this.upsertCategory(user.businessId!, dto.categoryName)).id : undefined;
    const brandId = dto.brandName ? (await this.upsertBrand(user.businessId!, dto.brandName)).id : undefined;
    const { categoryName: _categoryName, brandName: _brandName, initialStock: _initialStock, ...productData } = dto;
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
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    const archive = await this.canArchiveProduct(user.businessId!, id);
    if (!archive.allowed) throw new BadRequestException(archive.reasons.join(", "));
    return this.updateProductStatus(user, product, "ARCHIVED", "product.archive");
  }

  async pauseProduct(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    return this.updateProductStatus(user, product, "PAUSED", "product.pause");
  }

  async discontinueProduct(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    return this.updateProductStatus(user, product, "DISCONTINUED", "product.discontinue");
  }

  async reactivateProduct(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const product = await this.getProduct(user, id);
    if (!this.isProductCountedInLimit(product)) await this.enforceProductLimit(user.businessId!);
    const nextStatus = product.status === "ARCHIVED" ? "PAUSED" : "ACTIVE";
    const action = product.status === "ARCHIVED" ? "product.restore" : "product.reactivate";
    return this.updateProductStatus(user, product, nextStatus, action);
  }

  async balances(user: CurrentUser) {
    this.requireBusiness(user);
    return this.prisma.inventoryBalance.findMany({
      where: { businessId: user.businessId, product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } },
      include: { product: { include: { category: true, brand: true } }, branch: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  async receive(user: CurrentUser, dto: ReceiptDto) {
    this.requireBusiness(user);
    if (!dto.items.length) throw new BadRequestException("Receipt must include at least one item");
    const branch = await this.defaultBranch(user.businessId!);
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.stockReceipt.create({
        data: {
          businessId: user.businessId!,
          branchId: branch.id,
          userId: user.userId,
          documentNo: await this.nextDocumentNo(tx, user.businessId!, "REC"),
          supplier: dto.supplier,
          note: dto.note,
          totalCost: dto.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
        }
      });
      for (const item of dto.items) {
        const stockChange = await this.addStock(tx, user.businessId!, branch.id, item.productId, item.quantity, PRODUCT_STOCK_RECEIPT_STATUSES);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            branchId: branch.id,
            productId: item.productId,
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
  }

  async adjust(user: CurrentUser, dto: AdjustmentDto) {
    this.requireBusiness(user);
    if (dto.quantity === 0) throw new BadRequestException("Adjustment quantity cannot be zero");
    const branch = await this.defaultBranch(user.businessId!);
    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          businessId: user.businessId!,
          branchId: branch.id,
          userId: user.userId,
          documentNo: await this.nextDocumentNo(tx, user.businessId!, "ADJ"),
          reason: dto.reason
        }
      });
      const stockChange = dto.quantity > 0
        ? await this.addStock(tx, user.businessId!, branch.id, dto.productId, dto.quantity)
        : await this.removeStock(tx, user.businessId!, branch.id, dto.productId, Math.abs(dto.quantity));
      await tx.stockMovement.create({
        data: {
          businessId: user.businessId!,
          branchId: branch.id,
          productId: dto.productId,
          userId: user.userId,
          type: dto.quantity > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantity: Math.abs(dto.quantity),
          balanceBefore: stockChange.balanceBefore,
          balanceAfter: stockChange.quantity,
          reason: dto.reason,
          reference: adjustment.documentNo
        }
      });
      return adjustment;
    });
  }

  async movements(user: CurrentUser) {
    this.requireBusiness(user);
    return this.prisma.stockMovement.findMany({
      where: { businessId: user.businessId },
      include: { product: true, branch: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async createSale(user: CurrentUser, dto: SaleDto) {
    this.requireBusiness(user);
    if (!dto.items.length) throw new BadRequestException("Sale must include at least one item");
    const branch = await this.defaultBranch(user.businessId!);
    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { businessId: user.businessId, id: { in: dto.items.map((item) => item.productId) }, status: "ACTIVE" } });
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
        const stockChange = await this.removeStock(tx, user.businessId!, branch.id, item.product.id, item.quantity);
        await tx.stockMovement.create({
          data: {
            businessId: user.businessId!,
            branchId: branch.id,
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
  }

  async listSales(user: CurrentUser) {
    this.requireBusiness(user);
    return this.prisma.sale.findMany({
      where: { businessId: user.businessId },
      include: { items: { include: { product: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getSale(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const sale = await this.prisma.sale.findFirst({
      where: { id, businessId: user.businessId },
      include: { items: { include: { product: true } }, user: { select: { name: true } } }
    });
    if (!sale) throw new NotFoundException("Sale not found");
    return sale;
  }

  async dashboard(user: CurrentUser) {
    this.requireBusiness(user);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const [salesToday, salesThisMonth, products, balances, recentSales, recentMovements] = await Promise.all([
      this.prisma.sale.aggregate({ where: { businessId: user.businessId, createdAt: { gte: today }, status: "PAID" }, _sum: { total: true } }),
      this.prisma.sale.aggregate({ where: { businessId: user.businessId, createdAt: { gte: month }, status: "PAID" }, _sum: { total: true } }),
      this.prisma.product.findMany({ where: { businessId: user.businessId, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } }),
      this.prisma.inventoryBalance.findMany({ where: { businessId: user.businessId, product: { status: { in: PRODUCT_MANAGEMENT_STATUSES as any } } }, include: { product: true } }),
      this.prisma.sale.findMany({ where: { businessId: user.businessId }, orderBy: { createdAt: "desc" }, take: 5 }),
      this.prisma.stockMovement.findMany({ where: { businessId: user.businessId }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 5 })
    ]);
    const lowStock = balances.filter((balance) => balance.quantity > 0 && balance.quantity <= balance.product.minStock);
    const outOfStock = products.filter((product) => !balances.some((balance) => balance.productId === product.id && balance.quantity > 0));
    return {
      summary: {
        salesToday: Number(salesToday._sum.total ?? 0),
        salesThisMonth: Number(salesThisMonth._sum.total ?? 0),
        stockValue: balances.reduce((sum, balance) => sum + balance.quantity * Number(balance.product.costPrice), 0),
        totalProducts: await this.getUsedProductLimit(user.businessId!),
        lowStockProducts: lowStock.length,
        outOfStockProducts: outOfStock.length
      },
      recentSales,
      recentMovements
    };
  }

  async stockReport(user: CurrentUser) {
    return this.stockReportIncludingEmptyProducts(user);
  }

  private async stockReportIncludingEmptyProducts(user: CurrentUser) {
    this.requireBusiness(user);
    const products = await this.prisma.product.findMany({
      where: { businessId: user.businessId, status: { in: PRODUCT_MANAGEMENT_STATUSES as any } },
      include: { balances: true },
      orderBy: { createdAt: "desc" }
    });
    return products.map((product) => {
      const quantity = product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
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

  async salesReport(user: CurrentUser) {
    this.requireBusiness(user);
    return this.prisma.sale.groupBy({
      by: ["createdAt"],
      where: { businessId: user.businessId, status: "PAID" },
      _sum: { total: true },
      orderBy: { createdAt: "desc" },
      take: 60
    });
  }

  async members(user: CurrentUser) {
    this.requireBusiness(user);
    return this.prisma.businessMember.findMany({
      where: { businessId: user.businessId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async createMember(user: CurrentUser, dto: MemberDto) {
    this.requireBusiness(user);
    await this.enforceUserLimit(user.businessId!);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        memberships: { create: { businessId: user.businessId!, role: dto.role as RoleName } }
      }
    });
  }

  async updateMemberRole(user: CurrentUser, id: string, role: RoleName) {
    this.requireBusiness(user);
    return this.prisma.businessMember.update({ where: { id, businessId: user.businessId }, data: { role } });
  }

  async updateMemberStatus(user: CurrentUser, id: string, status: "ACTIVE" | "DISABLED") {
    this.requireBusiness(user);
    return this.prisma.businessMember.update({ where: { id, businessId: user.businessId }, data: { status } });
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

  async updateSubscription(user: CurrentUser, businessId: string, planCode: string) {
    this.requireSystemAdmin(user);
    const plan = await this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: planCode } });
    return this.prisma.businessSubscription.upsert({
      where: { businessId },
      create: { businessId, planId: plan.id },
      update: { planId: plan.id, status: "ACTIVE" }
    });
  }

  private requireBusiness(user: CurrentUser) {
    if (!user.businessId) throw new ForbiddenException("Business context is required");
  }

  private requireSystemAdmin(user: CurrentUser) {
    if (!user.isSystemAdmin) throw new ForbiddenException("System admin permission is required");
  }

  private branchWriteData(dto: Partial<BranchDto>) {
    const data: Record<string, string | null> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) data.code = this.normalizeBranchCode(dto.code);
    if (dto.type !== undefined) {
      if (!BRANCH_TYPES.includes(dto.type)) throw new BadRequestException("Invalid branch type");
      data.type = dto.type;
    }
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

  private normalizeBranchCode(code: string) {
    return code.trim().toUpperCase().replace(/\s+/g, "-");
  }

  private optionalText(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private async assertCanDeactivateBranch(businessId: string, branch: { id: string; isDefault?: boolean; status?: string }) {
    if (branch.status === "INACTIVE") return;
    if (branch.isDefault) {
      const stock = await this.prisma.inventoryBalance.aggregate({
        where: { businessId, branchId: branch.id },
        _sum: { quantity: true }
      });
      if ((stock._sum.quantity ?? 0) > 0) throw new BadRequestException("ไม่สามารถปิดใช้งานคลังหลักที่ยังมีสต็อกอยู่");
    }
    const activeBranches = await this.prisma.branch.count({ where: { businessId, status: "ACTIVE" as any } });
    if (activeBranches <= 1) throw new BadRequestException("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลัง");
  }

  private async defaultBranch(businessId: string) {
    return this.prisma.branch.findFirstOrThrow({ where: { businessId, isDefault: true } });
  }

  private async addStock(tx: Prisma.TransactionClient, businessId: string, branchId: string, productId: string, quantity: number, allowedStatuses: readonly string[] = PRODUCT_STOCK_ADJUSTMENT_STATUSES) {
    await this.assertProduct(tx, businessId, productId, allowedStatuses);
    const current = await tx.inventoryBalance.findUnique({ where: { businessId_branchId_productId: { businessId, branchId, productId } } });
    const balanceBefore = current?.quantity ?? 0;
    const balance = await tx.inventoryBalance.upsert({
      where: { businessId_branchId_productId: { businessId, branchId, productId } },
      create: { businessId, branchId, productId, quantity },
      update: { quantity: { increment: quantity } }
    });
    return { ...balance, balanceBefore };
  }

  private async removeStock(tx: Prisma.TransactionClient, businessId: string, branchId: string, productId: string, quantity: number, allowedStatuses: readonly string[] = PRODUCT_STOCK_ADJUSTMENT_STATUSES) {
    await this.assertProduct(tx, businessId, productId, allowedStatuses);
    const result = await tx.inventoryBalance.updateMany({
      where: { businessId, branchId, productId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } }
    });
    if (result.count !== 1) throw new BadRequestException("Insufficient stock");
    const balance = await tx.inventoryBalance.findUniqueOrThrow({ where: { businessId_branchId_productId: { businessId, branchId, productId } } });
    return { ...balance, balanceBefore: balance.quantity + quantity };
  }

  private async assertProduct(tx: Prisma.TransactionClient, businessId: string, productId: string, allowedStatuses: readonly string[]) {
    const product = await tx.product.findFirst({ where: { id: productId, businessId, status: { in: allowedStatuses as any } } });
    if (!product) throw new BadRequestException("Product is not available for this operation");
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

  private upsertBrand(businessId: string, name: string) {
    return this.prisma.brand.upsert({
      where: { businessId_name: { businessId, name } },
      create: { businessId, name },
      update: {}
    });
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
    const subscription = await this.prisma.businessSubscription.findUnique({ where: { businessId }, include: { plan: true } });
    const productCount = await this.getUsedProductLimit(businessId);
    if (subscription && productCount >= subscription.plan.productLimit) throw new BadRequestException(PRODUCT_LIMIT_ERROR);
  }

  private productListStatuses(status?: string) {
    if (!status) return PRODUCT_MANAGEMENT_STATUSES;
    const requested = status.split(",").map((item) => item.trim()).filter(Boolean);
    const allowed = new Set(["ACTIVE", "PAUSED", "DISCONTINUED", "ARCHIVED"]);
    if (requested.length && requested.every((item) => allowed.has(item))) return requested;
    throw new BadRequestException("Invalid product status filter");
  }

  private isProductCountedInLimit(product: { status: string; balances?: Array<{ quantity: number }> }) {
    if (product.status === "ACTIVE" || product.status === "PAUSED") return true;
    if (product.status === "DISCONTINUED") return (product.balances ?? []).reduce((sum, balance) => sum + balance.quantity, 0) > 0;
    return false;
  }

  private async updateProductStatus(user: CurrentUser, product: { id: string; status: string }, status: string, action: string) {
    const updated = await this.prisma.product.update({ where: { id: product.id }, data: { status: status as any } });
    await this.prisma.auditLog?.create?.({
      data: {
        businessId: user.businessId,
        userId: user.userId,
        action,
        entity: "Product",
        entityId: product.id,
        before: { status: product.status },
        after: { status }
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
    const subscription = await this.prisma.businessSubscription.findUnique({ where: { businessId }, include: { plan: true } });
    const memberCount = await this.prisma.businessMember.count({ where: { businessId, status: "ACTIVE" } });
    if (subscription && memberCount >= subscription.plan.userLimit) throw new BadRequestException("User limit reached for current plan");
  }

  private async enforceBranchLimit(businessId: string) {
    const subscription = await this.prisma.businessSubscription.findUnique({ where: { businessId }, include: { plan: true } });
    const branchCount = await this.prisma.branch.count({ where: { businessId } });
    if (subscription && branchCount >= subscription.plan.branchLimit) throw new BadRequestException("Branch limit reached for current plan");
  }

  private handleBranchWriteError(error: unknown): never {
    if (this.isUniqueConstraintError(error)) {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "";
      if (target.includes("code")) throw new BadRequestException(BRANCH_CODE_DUPLICATE_ERROR);
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
