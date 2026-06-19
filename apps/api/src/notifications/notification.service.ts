import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasPermission, type Permission, type Role } from "@zentory/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

type NotificationType = "STAFF_REQUEST" | "TRANSFER_REQUEST" | "TRANSFER_STATUS" | "STOCK_ALERT" | "STOCK_COUNT" | "SYSTEM";
type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
type NotificationStatusFilter = "all" | "unread" | "archived" | "history";
type RecipientMember = {
  userId: string | null;
  role: string;
  permissionOverrides: unknown;
  branchAssignments: Array<{ branchId: string }>;
};
type NotificationPayload = {
  businessId: string;
  branchId?: string | null;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  actionHref?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  recipientUserIds: string[];
};
type NotificationListFilters = {
  status?: string;
  type?: string;
  branchId?: string;
  limit?: string | number;
  cursor?: string;
  createdBefore?: string;
};

const managerRank: Record<string, number> = {
  VIEWER: 1,
  CASHIER: 2,
  STOCK_STAFF: 2,
  BRANCH_MANAGER: 3,
  MANAGER: 3,
  OWNER: 4
};

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: CurrentUser, filters: NotificationListFilters = {}) {
    this.requireBusiness(user);
    const status = this.notificationStatus(filters.status);
    if (status !== "history" && status !== "archived") await this.syncDerivedNotifications(user, filters.branchId);
    const type = this.notificationType(filters.type);
    const pagination = this.notificationPagination(filters);
    if (filters.branchId) await this.assertBranchAccess(user, filters.branchId);
    const rows = await (this.prisma as any).notificationRecipient.findMany({
      where: {
        AND: [pagination.cursorWhere],
        userId: user.userId,
        ...(status === "archived" ? { archivedAt: { not: null } } : status === "history" ? {} : { archivedAt: null }),
        ...(status === "unread" ? { readAt: null } : {}),
        notification: {
          businessId: user.businessId,
          ...(type ? { type } : {}),
          ...this.notificationListScopeWhere(status, filters.branchId, user.userId)
        }
      },
      include: { notification: { include: { branch: { select: { id: true, name: true, code: true } } } } },
      orderBy: [{ notification: { createdAt: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
      take: pagination.take
    });
    return this.serializeNotificationList(rows, pagination.limit, pagination.paginated);
  }

  async audit(user: CurrentUser, filters: NotificationListFilters = {}) {
    this.requireBusiness(user);
    const member = await this.currentMember(user);
    if (!member || (managerRank[member.role] ?? 0) < managerRank.BRANCH_MANAGER) throw new ForbiddenException("Notification audit is restricted to managers");
    const type = this.notificationType(filters.type);
    const pagination = this.notificationPagination(filters);
    if (filters.branchId) await this.assertAuditBranchAccess(user, member, filters.branchId);
    const branchWhere = this.notificationAuditBranchWhere(user, member, filters.branchId);
    const rows = await (this.prisma as any).notificationRecipient.findMany({
      where: {
        AND: [
          { OR: [{ archivedAt: { not: null } }, { notification: { resolvedAt: { not: null } } }] },
          pagination.cursorWhere
        ],
        notification: {
          businessId: user.businessId,
          ...(type ? { type } : {}),
          ...branchWhere
        }
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        notification: { include: { branch: { select: { id: true, name: true, code: true } } } }
      },
      orderBy: [{ notification: { createdAt: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
      take: pagination.take
    });
    return this.serializeNotificationList(rows, pagination.limit, pagination.paginated);
  }

  async summary(user: CurrentUser, filters: { branchId?: string } = {}) {
    this.requireBusiness(user);
    await this.syncDerivedNotifications(user, filters.branchId);
    if (filters.branchId) await this.assertBranchAccess(user, filters.branchId);
    const branchWhere = this.notificationBranchWhere(filters.branchId);
    const activeWhere = { userId: user.userId, archivedAt: null, notification: { businessId: user.businessId, resolvedAt: null, ...branchWhere } };
    const liveCounts = await this.liveSummaryCounts(user, filters.branchId);
    const [unreadCount, activeCount, preview, archivedCount] = await Promise.all([
      (this.prisma as any).notificationRecipient.count({ where: { userId: user.userId, readAt: null, archivedAt: null, notification: { businessId: user.businessId, ...branchWhere } } }),
      (this.prisma as any).notificationRecipient.count({ where: activeWhere }),
      (this.prisma as any).notificationRecipient.findMany({
        where: { userId: user.userId, archivedAt: null, OR: [{ readAt: null }, { notification: { resolvedAt: null } }], notification: { businessId: user.businessId, ...branchWhere } },
        include: { notification: { include: { branch: { select: { id: true, name: true, code: true } } } } },
        orderBy: [{ readAt: "asc" }, { notification: { createdAt: "desc" } }, { createdAt: "desc" }],
        take: 5
      }),
      (this.prisma as any).notificationRecipient.count({ where: { userId: user.userId, archivedAt: { not: null }, notification: { businessId: user.businessId, ...branchWhere } } })
    ]);
    const openActionCount = liveCounts.transferRequestCount + liveCounts.transferReceiveCount + liveCounts.staffRequestCount + liveCounts.stockCountReviewCount;
    const stockCount = liveCounts.outOfStockCount + liveCounts.lowStockCount;
    return {
      unreadCount,
      activeCount: openActionCount + stockCount,
      openActionCount,
      stockCount,
      outOfStockCount: liveCounts.outOfStockCount,
      lowStockCount: liveCounts.lowStockCount,
      transferRequestCount: liveCounts.transferRequestCount,
      transferReceiveCount: liveCounts.transferReceiveCount,
      staffRequestCount: liveCounts.staffRequestCount,
      stockCountReviewCount: liveCounts.stockCountReviewCount,
      archivedCount,
      preview: preview.map((row: any) => this.serializeRecipient(row))
    };
  }

  async markRead(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const recipient = await this.findRecipient(user, id);
    if (!recipient.readAt) {
      await (this.prisma as any).notificationRecipient.update({ where: { id: recipient.id }, data: { readAt: new Date() } });
    }
    return { ok: true };
  }

  async markAllRead(user: CurrentUser, filters: { branchId?: string } = {}) {
    this.requireBusiness(user);
    if (filters.branchId) await this.assertBranchAccess(user, filters.branchId);
    await (this.prisma as any).notificationRecipient.updateMany({
      where: { userId: user.userId, readAt: null, archivedAt: null, notification: { businessId: user.businessId, ...this.notificationBranchWhere(filters.branchId) } },
      data: { readAt: new Date() }
    });
    return { ok: true };
  }

  async archive(user: CurrentUser, id: string) {
    this.requireBusiness(user);
    const recipient = await this.findRecipient(user, id);
    const now = new Date();
    await (this.prisma as any).notificationRecipient.update({
      where: { id: recipient.id },
      data: { archivedAt: now, readAt: recipient.readAt ?? now }
    });
    return { ok: true };
  }

  async createStaffRequestNotification(businessId: string, memberId: string) {
    const member = await (this.prisma as any).businessMember.findFirst({
      where: { id: memberId, businessId },
      include: { user: { select: { name: true, email: true } }, requestedBranch: { select: { id: true, name: true } } }
    });
    if (!member || member.status !== "PENDING") return;
    const recipients = await this.permissionRecipientUserIds(businessId, "members.manage", member.requestedBranchId ?? undefined);
    await this.upsertNotification({
      businessId,
      branchId: member.requestedBranchId,
      type: "STAFF_REQUEST",
      severity: "INFO",
      title: `คำขอเข้าทำงานจาก ${member.employeeName || member.user?.name || "พนักงานใหม่"}`,
      body: member.requestedBranch?.name ? `ต้องการเข้าร่วมสาขา ${member.requestedBranch.name}` : member.user?.email ?? "รออนุมัติพนักงานใหม่",
      actionHref: "/app/staff#staff-requests",
      entityType: "BusinessMember",
      entityId: member.id,
      dedupeKey: `staff-request:${member.id}`,
      recipientUserIds: recipients
    });
  }

  async resolveStaffRequestNotification(businessId: string, memberId: string) {
    await this.resolveNotification(businessId, `staff-request:${memberId}`);
  }

  async createTransferRequestNotification(businessId: string, transferId: string) {
    const transfer = await this.transferForNotification(businessId, transferId);
    if (!transfer || transfer.status !== "REQUESTED") return;
    const recipients = await this.transferManagerRecipientUserIds(businessId, transfer.sourceWarehouse.branchId);
    await this.upsertNotification({
      businessId,
      branchId: transfer.sourceWarehouse.branchId,
      type: "TRANSFER_REQUEST",
      severity: "WARNING",
      title: `คำขอโอน ${transfer.documentNo} รออนุมัติ`,
      body: `${transfer.sourceWarehouse.branch?.name ?? "ต้นทาง"} ไป ${transfer.destinationWarehouse.branch?.name ?? "ปลายทาง"}`,
      actionHref: "/app/transfers?status=REQUESTED",
      entityType: "StockTransfer",
      entityId: transfer.id,
      dedupeKey: `transfer-request:${transfer.id}`,
      recipientUserIds: recipients.filter((id) => id !== transfer.requestedById)
    });
  }

  async createTransferReceiveNotification(businessId: string, transferId: string) {
    const transfer = await this.transferForNotification(businessId, transferId);
    if (!transfer || transfer.status !== "IN_TRANSIT") return;
    const recipients = await this.transferManagerRecipientUserIds(businessId, transfer.destinationWarehouse.branchId);
    await this.upsertNotification({
      businessId,
      branchId: transfer.destinationWarehouse.branchId,
      type: "TRANSFER_REQUEST",
      severity: "WARNING",
      title: `คำขอโอน ${transfer.documentNo} รอยืนยันรับสินค้า`,
      body: `${transfer.sourceWarehouse.branch?.name ?? "ต้นทาง"} ไป ${transfer.destinationWarehouse.branch?.name ?? "ปลายทาง"}`,
      actionHref: "/app/transfers/requests",
      entityType: "StockTransfer",
      entityId: transfer.id,
      dedupeKey: `transfer-receive:${transfer.id}`,
      recipientUserIds: recipients.filter((id) => id !== transfer.sourceApprovedById)
    });
  }

  async createTransferStatusNotification(businessId: string, transferId: string, statusLabel: string, severity: NotificationSeverity = "INFO") {
    const transfer = await this.transferForNotification(businessId, transferId);
    if (!transfer) return;
    await this.resolveNotification(businessId, `transfer-request:${transfer.id}`);
    if (transfer.status !== "IN_TRANSIT") await this.resolveNotification(businessId, `transfer-receive:${transfer.id}`);
    const recipients = Array.from(new Set([transfer.createdById, transfer.requestedById].filter(Boolean)));
    await this.upsertNotification({
      businessId,
      branchId: transfer.destinationWarehouse.branchId,
      type: "TRANSFER_STATUS",
      severity,
      title: `คำขอโอน ${transfer.documentNo} ${statusLabel}`,
      body: `${transfer.sourceWarehouse.branch?.name ?? "ต้นทาง"} ไป ${transfer.destinationWarehouse.branch?.name ?? "ปลายทาง"}`,
      actionHref: `/app/transfers?status=${encodeURIComponent(transfer.status)}`,
      entityType: "StockTransfer",
      entityId: transfer.id,
      dedupeKey: `transfer-status:${transfer.id}:${transfer.status}`,
      recipientUserIds: recipients
    });
  }

  async refreshStockAlertsForProducts(businessId: string, productIds: string[], branchIds?: string[]) {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueProductIds.length === 0) return;
    const products = await (this.prisma as any).product.findMany({
      where: { businessId, id: { in: uniqueProductIds } },
      include: { balances: { include: { warehouse: { select: { branchId: true } } } } }
    });
    const branches = branchIds?.length
      ? await this.prisma.branch.findMany({ where: { businessId, id: { in: Array.from(new Set(branchIds)) }, status: "ACTIVE" as any }, select: { id: true, name: true } })
      : await this.prisma.branch.findMany({ where: { businessId, status: "ACTIVE" as any }, select: { id: true, name: true } });
    const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
    for (const product of products) {
      for (const branch of branches) {
        const dedupeKey = `stock-alert:${branch.id}:${product.id}`;
        const branchBalances = product.balances.filter((balance: any) => balance.warehouse.branchId === branch.id);
        const quantity = branchBalances.reduce((sum: number, balance: any) => sum + balance.quantity, 0);
        if (quantity > product.minStock) {
          await this.resolveNotification(businessId, dedupeKey);
          continue;
        }
        const severity: NotificationSeverity = quantity <= 0 ? "CRITICAL" : "WARNING";
        const statusLabel = quantity <= 0 ? "หมดสต็อก" : "ใกล้หมด";
        const recipients = await this.permissionRecipientUserIds(businessId, "reports.stock.read", branch.id);
        await this.upsertNotification({
          businessId,
          branchId: branch.id,
          type: "STOCK_ALERT",
          severity,
          title: `${product.name} ${statusLabel}`,
          body: `สาขา ${branchNameById.get(branch.id) ?? "-"} คงเหลือ ${quantity} / จุดแจ้งเตือน ${product.minStock}`,
          actionHref: `/app/products/${product.id}`,
          entityType: "Product",
          entityId: product.id,
          dedupeKey,
          recipientUserIds: recipients
        });
      }
    }
  }

  async createStockCountReviewNotification(businessId: string, stockCountId: string) {
    const count = await (this.prisma as any).stockCount.findFirst({
      where: { id: stockCountId, businessId },
      include: { warehouse: { include: { branch: true } }, user: { select: { name: true } }, items: { select: { difference: true } } }
    });
    if (!count || count.status !== "REVIEW") return;
    const recipients = await this.permissionRecipientUserIds(businessId, "inventory.adjust", count.warehouse.branchId);
    const changedCount = count.items.filter((item: any) => item.difference !== 0 && item.difference !== null).length;
    await this.upsertNotification({
      businessId,
      branchId: count.warehouse.branchId,
      type: "STOCK_COUNT",
      severity: changedCount > 0 ? "WARNING" : "INFO",
      title: `รอบนับสต็อก ${count.documentNo} รอตรวจทาน`,
      body: `${count.warehouse.name} • พบส่วนต่าง ${changedCount} รายการ`,
      actionHref: "/app/stock-counts",
      entityType: "StockCount",
      entityId: count.id,
      dedupeKey: `stock-count-review:${count.id}`,
      recipientUserIds: recipients
    });
  }

  async resolveStockCountReviewNotification(businessId: string, stockCountId: string) {
    await this.resolveNotification(businessId, `stock-count-review:${stockCountId}`);
  }

  private async syncDerivedNotifications(user: CurrentUser, branchId?: string) {
    const member = await this.currentMember(user);
    if (!member) return;
    if (branchId) await this.assertBranchAccess(user, branchId);
    const branchIds = branchId ? [branchId] : await this.accessibleBranchIds(user.businessId!, member);
    await Promise.all([
      this.syncStockAlerts(user.businessId!, member, branchIds),
      this.syncStaffRequests(user.businessId!, member, branchIds),
      this.syncTransferRequests(user.businessId!, member, branchIds),
      this.syncStockCountReviews(user.businessId!, member, branchIds)
    ]);
  }

  private async syncStockAlerts(businessId: string, member: RecipientMember, branchIds?: string[]) {
    if (!this.memberHasPermission(member, "reports.stock.read")) return;
    const products = await (this.prisma as any).product.findMany({
      where: { businessId, status: { in: ["ACTIVE", "PAUSED", "DISCONTINUED"] } },
      select: { id: true }
    });
    await this.refreshStockAlertsForProducts(businessId, products.map((product: any) => product.id), branchIds);
  }

  private async syncStaffRequests(businessId: string, member: RecipientMember, branchIds?: string[]) {
    if (!this.memberHasPermission(member, "members.manage")) return;
    const requests = await (this.prisma as any).businessMember.findMany({
      where: {
        businessId,
        status: "PENDING",
        role: { not: "OWNER" },
        ...(branchIds ? { OR: [{ requestedBranchId: null }, { requestedBranchId: { in: branchIds } }] } : {})
      },
      select: { id: true }
    });
    await Promise.all(requests.map((request: any) => this.createStaffRequestNotification(businessId, request.id)));
  }

  private async syncTransferRequests(businessId: string, member: RecipientMember, branchIds?: string[]) {
    if ((managerRank[member.role] ?? 0) < managerRank.MANAGER) return;
    const transfers = await (this.prisma as any).stockTransfer.findMany({
      where: {
        businessId,
        OR: [
          { status: "REQUESTED", ...(branchIds ? { sourceWarehouse: { branchId: { in: branchIds } } } : {}) },
          { status: "IN_TRANSIT", ...(branchIds ? { destinationWarehouse: { branchId: { in: branchIds } } } : {}) }
        ]
      },
      select: { id: true, status: true }
    });
    await Promise.all(transfers.map((transfer: any) => (
      transfer.status === "IN_TRANSIT"
        ? this.createTransferReceiveNotification(businessId, transfer.id)
        : this.createTransferRequestNotification(businessId, transfer.id)
    )));
  }

  private async syncStockCountReviews(businessId: string, member: RecipientMember, branchIds?: string[]) {
    if (!this.memberHasPermission(member, "inventory.adjust")) return;
    const counts = await (this.prisma as any).stockCount.findMany({
      where: {
        businessId,
        status: "REVIEW",
        ...(branchIds ? { warehouse: { branchId: { in: branchIds } } } : {})
      },
      select: { id: true }
    });
    await Promise.all(counts.map((count: any) => this.createStockCountReviewNotification(businessId, count.id)));
  }

  private async liveSummaryCounts(user: CurrentUser, branchId?: string) {
    const member = await this.currentMember(user);
    if (!member) return { outOfStockCount: 0, lowStockCount: 0, transferRequestCount: 0, transferReceiveCount: 0, staffRequestCount: 0, stockCountReviewCount: 0 };
    const branchIds = branchId ? [branchId] : await this.accessibleBranchIds(user.businessId!, member);
    const [stock, transferRequestCount, transferReceiveCount, staffRequestCount, stockCountReviewCount] = await Promise.all([
      this.liveStockAlertCounts(user.businessId!, member, branchIds),
      this.liveTransferActionCount(user.businessId!, member, "REQUESTED", "source", branchIds),
      this.liveTransferActionCount(user.businessId!, member, "IN_TRANSIT", "destination", branchIds),
      this.liveStaffRequestCount(user.businessId!, member, branchIds),
      this.liveStockCountReviewCount(user.businessId!, member, branchIds)
    ]);
    return { ...stock, transferRequestCount, transferReceiveCount, staffRequestCount, stockCountReviewCount };
  }

  private async liveStockAlertCounts(businessId: string, member: RecipientMember, branchIds?: string[]) {
    if (!this.memberHasPermission(member, "reports.stock.read")) return { outOfStockCount: 0, lowStockCount: 0 };
    const targetBranchIds = branchIds ?? await this.accessibleStockBranchIds(businessId, member);
    const products = await (this.prisma as any).product.findMany({
      where: { businessId, status: { in: ["ACTIVE", "PAUSED", "DISCONTINUED"] } },
      include: {
        balances: {
          where: targetBranchIds ? { warehouse: { branchId: { in: targetBranchIds } } } : {},
          include: { warehouse: { select: { branchId: true } } }
        }
      }
    });
    let outOfStockCount = 0;
    let lowStockCount = 0;
    for (const product of products) {
      const balancesByBranch = new Map<string, number>();
      for (const balance of product.balances) {
        const branchId = balance.warehouse.branchId;
        balancesByBranch.set(branchId, (balancesByBranch.get(branchId) ?? 0) + balance.quantity);
      }
      const quantities = targetBranchIds ? targetBranchIds.map((branchId) => balancesByBranch.get(branchId) ?? 0) : Array.from(balancesByBranch.values());
      for (const quantity of quantities) {
        if (quantity <= 0) outOfStockCount += 1;
        else if (quantity <= product.minStock) lowStockCount += 1;
      }
    }
    return { outOfStockCount, lowStockCount };
  }

  private async accessibleStockBranchIds(businessId: string, member: RecipientMember) {
    const accessibleBranchIds = await this.accessibleBranchIds(businessId, member);
    if (accessibleBranchIds) return accessibleBranchIds;
    const branches = await this.prisma.branch.findMany({ where: { businessId, status: "ACTIVE" as any }, select: { id: true } });
    return branches.map((branch) => branch.id);
  }

  private async liveTransferActionCount(businessId: string, member: RecipientMember, status: "REQUESTED" | "IN_TRANSIT", side: "source" | "destination", branchIds?: string[]) {
    if ((managerRank[member.role] ?? 0) < managerRank.MANAGER) return 0;
    const warehouseWhere = side === "source" ? "sourceWarehouse" : "destinationWarehouse";
    const transfers = await (this.prisma as any).stockTransfer.findMany({
      where: {
        businessId,
        status,
        ...(branchIds ? { [warehouseWhere]: { branchId: { in: branchIds } } } : {})
      },
      select: {
        status: true,
        sourceWarehouse: { select: { branchId: true } },
        destinationWarehouse: { select: { branchId: true } }
      }
    });
    if (member.role !== "OWNER") return transfers.length;
    const managedBranchIds = await this.nonOwnerManagedBranchIds(businessId);
    return transfers.filter((transfer: any) => {
      const targetBranchId = side === "destination" ? transfer.destinationWarehouse.branchId : transfer.sourceWarehouse.branchId;
      return !managedBranchIds.has(targetBranchId);
    }).length;
  }

  private liveStaffRequestCount(businessId: string, member: RecipientMember, branchIds?: string[]) {
    if (!this.memberHasPermission(member, "members.manage")) return Promise.resolve(0);
    return (this.prisma as any).businessMember.count({
      where: {
        businessId,
        status: "PENDING",
        role: { not: "OWNER" },
        ...(branchIds ? { OR: [{ requestedBranchId: null }, { requestedBranchId: { in: branchIds } }] } : {})
      }
    });
  }

  private liveStockCountReviewCount(businessId: string, member: RecipientMember, branchIds?: string[]) {
    if (!this.memberHasPermission(member, "inventory.adjust")) return Promise.resolve(0);
    return (this.prisma as any).stockCount.count({
      where: {
        businessId,
        status: "REVIEW",
        ...(branchIds ? { warehouse: { branchId: { in: branchIds } } } : {})
      }
    });
  }

  private async upsertNotification(payload: NotificationPayload) {
    const recipientUserIds = Array.from(new Set(payload.recipientUserIds.filter(Boolean)));
    if (recipientUserIds.length === 0) return;
    const now = new Date();
    const notification = payload.dedupeKey
      ? await (this.prisma as any).notification.upsert({
          where: { businessId_dedupeKey: { businessId: payload.businessId, dedupeKey: payload.dedupeKey } },
          create: this.notificationCreateData(payload),
          update: {
            branchId: payload.branchId ?? null,
            type: payload.type,
            severity: payload.severity ?? "INFO",
            title: payload.title,
            body: payload.body ?? null,
            actionHref: payload.actionHref ?? null,
            entityType: payload.entityType ?? null,
            entityId: payload.entityId ?? null,
            resolvedAt: null,
            createdAt: now
          }
        })
      : await (this.prisma as any).notification.create({ data: this.notificationCreateData(payload) });

    await (this.prisma as any).notificationRecipient.createMany({
      data: recipientUserIds.map((userId) => ({ notificationId: notification.id, userId })),
      skipDuplicates: true
    });
    await (this.prisma as any).notificationRecipient.updateMany({
      where: { notificationId: notification.id, userId: { in: recipientUserIds } },
      data: { readAt: null, archivedAt: null }
    });
  }

  private notificationCreateData(payload: NotificationPayload) {
    return {
      businessId: payload.businessId,
      branchId: payload.branchId ?? null,
      type: payload.type,
      severity: payload.severity ?? "INFO",
      title: payload.title,
      body: payload.body ?? null,
      actionHref: payload.actionHref ?? null,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      dedupeKey: payload.dedupeKey ?? null
    };
  }

  private async resolveNotification(businessId: string, dedupeKey: string) {
    await (this.prisma as any).notification.updateMany({
      where: { businessId, dedupeKey, resolvedAt: null },
      data: { resolvedAt: new Date() }
    });
  }

  private async findRecipient(user: CurrentUser, id: string) {
    const recipient = await (this.prisma as any).notificationRecipient.findFirst({
      where: { id, userId: user.userId, notification: { businessId: user.businessId } },
      include: { notification: true }
    });
    if (!recipient) throw new NotFoundException("Notification not found");
    return recipient;
  }

  private async permissionRecipientUserIds(businessId: string, permission: Permission, branchId?: string) {
    const members = await this.activeMembers(businessId);
    return members
      .filter((member) => this.memberHasPermission(member, permission))
      .filter((member) => this.memberCanAccessBranch(member, branchId))
      .map((member) => member.userId!)
      .filter(Boolean);
  }

  private async transferManagerRecipientUserIds(businessId: string, branchId: string) {
    const members = await this.activeMembers(businessId);
    const branchManagers = members
      .filter((member) => (managerRank[member.role] ?? 0) >= managerRank.MANAGER)
      .filter((member) => member.role !== "OWNER")
      .filter((member) => this.memberCanAccessBranch(member, branchId))
      .map((member) => member.userId!)
      .filter(Boolean);
    if (branchManagers.length > 0) return branchManagers;
    return members
      .filter((member) => member.role === "OWNER")
      .map((member) => member.userId!)
      .filter(Boolean);
  }

  private async nonOwnerManagedBranchIds(businessId: string) {
    const members = await this.activeMembers(businessId);
    const branchIds = new Set<string>();
    for (const member of members) {
      if (member.role === "OWNER" || (managerRank[member.role] ?? 0) < managerRank.MANAGER) continue;
      for (const assignment of member.branchAssignments) branchIds.add(assignment.branchId);
    }
    return branchIds;
  }

  private activeMembers(businessId: string): Promise<RecipientMember[]> {
    return (this.prisma as any).businessMember.findMany({
      where: { businessId, status: "ACTIVE", userId: { not: null } },
      select: { userId: true, role: true, permissionOverrides: true, branchAssignments: { where: { branch: { status: "ACTIVE" } }, select: { branchId: true } } }
    });
  }

  private memberHasPermission(member: RecipientMember, permission: Permission) {
    return hasPermission(member.role as Role, member.permissionOverrides, permission);
  }

  private memberCanAccessBranch(member: RecipientMember, branchId?: string) {
    if (!branchId || member.role === "OWNER") return true;
    if (member.branchAssignments.length === 0) return true;
    return member.branchAssignments.some((assignment) => assignment.branchId === branchId);
  }

  private async assertBranchAccess(user: CurrentUser, branchId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, businessId: user.businessId } });
    if (!branch) throw new BadRequestException("Branch is not available for this business");
    if (user.role === "OWNER" || !user.assignedBranchIds?.length || user.assignedBranchIds.includes(branchId)) return;
    throw new ForbiddenException("Branch is not available for this user");
  }

  private transferForNotification(businessId: string, transferId: string) {
    return (this.prisma as any).stockTransfer.findFirst({
      where: { id: transferId, businessId },
      include: {
        sourceWarehouse: { include: { branch: true } },
        destinationWarehouse: { include: { branch: true } }
      }
    });
  }

  private serializeRecipient(row: any) {
    return {
      id: row.id,
      readAt: row.readAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      user: row.user ? { id: row.user.id, name: row.user.name, email: row.user.email } : undefined,
      notification: row.notification
    };
  }

  private serializeNotificationList(rows: any[], limit: number, paginated: boolean) {
    const pageRows = paginated && rows.length > limit ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row: any) => this.serializeRecipient(row));
    if (!paginated) return items;
    const last = pageRows[pageRows.length - 1];
    return { items, nextCursor: rows.length > limit ? this.notificationCursorForRow(last) : null };
  }

  private notificationPagination(filters: NotificationListFilters) {
    const paginated = filters.limit !== undefined || filters.cursor !== undefined || filters.createdBefore !== undefined;
    const limit = this.notificationLimit(filters.limit);
    return {
      paginated,
      limit,
      take: paginated ? limit + 1 : 100,
      cursorWhere: this.notificationCursorWhere(filters.cursor ?? filters.createdBefore)
    };
  }

  private notificationLimit(raw?: string | number) {
    if (raw === undefined || raw === "") return 50;
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException("Invalid notification limit");
    return limit;
  }

  private notificationCursorForRow(row: any) {
    if (!row?.notification?.createdAt || !row.createdAt || !row.id) return null;
    return [
      new Date(row.notification.createdAt).toISOString(),
      new Date(row.createdAt).toISOString(),
      row.id
    ].join("|");
  }

  private notificationCursorWhere(raw?: string) {
    if (!raw) return {};
    const [notificationCreatedAtRaw, recipientCreatedAtRaw, recipientId] = raw.split("|");
    const notificationCreatedAt = new Date(notificationCreatedAtRaw);
    if (Number.isNaN(notificationCreatedAt.getTime())) throw new BadRequestException("Invalid notification cursor");
    if (!recipientCreatedAtRaw || !recipientId) return { notification: { createdAt: { lt: notificationCreatedAt } } };
    const recipientCreatedAt = new Date(recipientCreatedAtRaw);
    if (Number.isNaN(recipientCreatedAt.getTime())) throw new BadRequestException("Invalid notification cursor");
    return {
      OR: [
        { notification: { createdAt: { lt: notificationCreatedAt } } },
        { AND: [{ notification: { createdAt: notificationCreatedAt } }, { createdAt: { lt: recipientCreatedAt } }] },
        { AND: [{ notification: { createdAt: notificationCreatedAt } }, { createdAt: recipientCreatedAt }, { id: { lt: recipientId } }] }
      ]
    };
  }

  private notificationStatus(status?: string): NotificationStatusFilter {
    if (!status) return "all";
    const normalized = status.trim().toLowerCase();
    if (normalized === "all" || normalized === "unread" || normalized === "archived" || normalized === "history") return normalized;
    throw new BadRequestException("Invalid notification status filter");
  }

  private notificationType(type?: string) {
    if (!type) return undefined;
    const normalized = type.trim().toUpperCase();
    if (["STAFF_REQUEST", "TRANSFER_REQUEST", "TRANSFER_STATUS", "STOCK_ALERT", "STOCK_COUNT", "SYSTEM"].includes(normalized)) return normalized;
    throw new BadRequestException("Invalid notification type filter");
  }

  private requireBusiness(user: CurrentUser) {
    if (!user.businessId) throw new BadRequestException("Business context is required");
  }

  private notificationBranchWhere(branchId?: string) {
    return branchId ? { OR: [{ branchId }, { branchId: null }] } : {};
  }

  private notificationHistoryWhere(userId: string) {
    return { OR: [{ resolvedAt: { not: null } }, { recipients: { some: { userId, archivedAt: { not: null } } } }] };
  }

  private notificationListScopeWhere(status: NotificationStatusFilter, branchId: string | undefined, userId: string) {
    if (status !== "history") return this.notificationBranchWhere(branchId);
    const historyWhere = this.notificationHistoryWhere(userId);
    const branchWhere = this.notificationBranchWhere(branchId);
    return branchId ? { AND: [historyWhere, branchWhere] } : historyWhere;
  }

  private notificationAuditBranchWhere(user: CurrentUser, member: RecipientMember, branchId?: string) {
    if (branchId) return this.notificationBranchWhere(branchId);
    if (user.isSystemAdmin || member.role === "OWNER" || member.branchAssignments.length === 0) return {};
    return { OR: [{ branchId: { in: member.branchAssignments.map((assignment) => assignment.branchId) } }, { branchId: null }] };
  }

  private async assertAuditBranchAccess(user: CurrentUser, member: RecipientMember, branchId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, businessId: user.businessId } });
    if (!branch) throw new BadRequestException("Branch is not available for this business");
    if (user.isSystemAdmin || member.role === "OWNER" || member.branchAssignments.length === 0) return;
    if (member.branchAssignments.some((assignment) => assignment.branchId === branchId)) return;
    throw new ForbiddenException("Branch is not available for this user");
  }

  private async currentMember(user: CurrentUser): Promise<RecipientMember | undefined> {
    if (!user.businessId) return undefined;
    if (user.isSystemAdmin) return { userId: user.userId, role: "OWNER", permissionOverrides: {}, branchAssignments: [] };
    return (this.prisma as any).businessMember.findFirst({
      where: { businessId: user.businessId, userId: user.userId, status: "ACTIVE" },
      select: { userId: true, role: true, permissionOverrides: true, branchAssignments: { where: { branch: { status: "ACTIVE" } }, select: { branchId: true } } }
    });
  }

  private async accessibleBranchIds(businessId: string, member: RecipientMember) {
    if (member.role === "OWNER") return undefined;
    const ids = member.branchAssignments.map((assignment) => assignment.branchId);
    if (ids.length > 0) return ids;
    const branches = await this.prisma.branch.findMany({ where: { businessId, status: "ACTIVE" as any }, select: { id: true } });
    return branches.map((branch) => branch.id);
  }
}
