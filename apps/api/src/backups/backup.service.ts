import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { createReadStream, promises as fs } from "fs";
import { join, resolve } from "path";
import { CurrentUser } from "../common/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get("BACKUP_AUTO_ENABLED", "false") !== "true") return;
    const intervalMs = Number(this.config.get("BACKUP_INTERVAL_MS", 24 * 60 * 60 * 1000));
    this.timer = setInterval(() => void this.runScheduledBackups(), intervalMs);
    this.timer.unref?.();
  }

  async list(user: CurrentUser) {
    this.requireBackupAccess(user);
    const rows = await this.prisma.backupRecord.findMany({
      where: { businessId: user.businessId },
      orderBy: { startedAt: "desc" },
      take: 50
    });
    return rows.map((row) => this.serialize(row));
  }

  async createManual(user: CurrentUser) {
    this.requireBackupAccess(user);
    return this.createBusinessBackup(user.businessId!, user.userId, "MANUAL");
  }

  async download(user: CurrentUser, id: string) {
    this.requireBackupAccess(user);
    const record = await this.prisma.backupRecord.findFirst({ where: { id, businessId: user.businessId } });
    if (!record) throw new NotFoundException("Backup not found");
    if (record.status !== "SUCCESS" || !record.storagePath || !record.fileName) throw new BadRequestException("Backup is not ready for download");
    return {
      stream: createReadStream(record.storagePath),
      fileName: record.fileName
    };
  }

  private requireBackupAccess(user: CurrentUser) {
    if (user.isSystemAdmin || user.role === "OWNER") return;
    throw new ForbiddenException("Backup is restricted to owners");
  }

  private async runScheduledBackups() {
    const businesses = await this.prisma.business.findMany({ select: { id: true } });
    for (const business of businesses) {
      try {
        await this.createBusinessBackup(business.id, undefined, "AUTO");
      } catch (error) {
        this.logger.error(`Scheduled backup failed for ${business.id}`, error as Error);
      }
    }
  }

  private async createBusinessBackup(businessId: string, requestedById: string | undefined, scope: string) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.retentionDays() * 24 * 60 * 60 * 1000);
    const record = await this.prisma.backupRecord.create({
      data: { businessId, requestedById, scope, status: "RUNNING" as any, startedAt: now, expiresAt }
    });
    try {
      const payload = await this.businessPayload(businessId);
      const json = JSON.stringify(payload, null, 2);
      const checksum = createHash("sha256").update(json).digest("hex");
      const dir = this.backupDir();
      await fs.mkdir(dir, { recursive: true });
      const fileName = `zentory-${businessId}-${now.toISOString().replace(/[:.]/g, "-")}.json`;
      const storagePath = join(dir, fileName);
      await fs.writeFile(storagePath, json, "utf8");
      const stat = await fs.stat(storagePath);
      const updated = await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: { status: "SUCCESS" as any, completedAt: new Date(), storagePath, fileName, sizeBytes: stat.size, checksum }
      });
      await this.deleteExpiredBackups(businessId);
      return this.serialize(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backup failed";
      const failed = await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: { status: "FAILED" as any, completedAt: new Date(), errorMessage: message }
      });
      await this.createFailureNotification(businessId, failed.id, message);
      return this.serialize(failed);
    }
  }

  private async businessPayload(businessId: string) {
    const [
      business,
      members,
      branches,
      warehouses,
      categories,
      brands,
      products,
      balances,
      movements,
      receipts,
      adjustments,
      transfers,
      stockCounts,
      sales
    ] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: businessId } }),
      this.prisma.businessMember.findMany({ where: { businessId }, include: { branchAssignments: true } }),
      this.prisma.branch.findMany({ where: { businessId } }),
      this.prisma.warehouse.findMany({ where: { businessId } }),
      this.prisma.category.findMany({ where: { businessId } }),
      this.prisma.brand.findMany({ where: { businessId } }),
      this.prisma.product.findMany({ where: { businessId } }),
      this.prisma.inventoryBalance.findMany({ where: { businessId } }),
      this.prisma.stockMovement.findMany({ where: { businessId }, take: 20000, orderBy: { createdAt: "desc" } }),
      this.prisma.stockReceipt.findMany({ where: { businessId } }),
      this.prisma.stockAdjustment.findMany({ where: { businessId } }),
      this.prisma.stockTransfer.findMany({ where: { businessId }, include: { items: true } }),
      this.prisma.stockCount.findMany({ where: { businessId }, include: { items: true } }),
      this.prisma.sale.findMany({ where: { businessId }, include: { items: true }, take: 20000, orderBy: { createdAt: "desc" } })
    ]);
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      businessId,
      assets: {
        uploadsPath: resolve(process.cwd(), "uploads"),
        productImagePaths: products.map((product) => product.imagePath).filter(Boolean)
      },
      data: { business, members, branches, warehouses, categories, brands, products, balances, movements, receipts, adjustments, transfers, stockCounts, sales }
    };
  }

  private backupDir() {
    return resolve(this.config.get("BACKUP_DIR", join(process.cwd(), "backups")));
  }

  private retentionDays() {
    const days = Number(this.config.get("BACKUP_RETENTION_DAYS", 30));
    return Number.isFinite(days) && days > 0 ? days : 30;
  }

  private async deleteExpiredBackups(businessId: string) {
    const expired = await this.prisma.backupRecord.findMany({
      where: { businessId, status: "SUCCESS" as any, expiresAt: { lt: new Date() } }
    });
    for (const record of expired) {
      if (record.storagePath) await fs.rm(record.storagePath, { force: true }).catch(() => undefined);
      await this.prisma.backupRecord.update({ where: { id: record.id }, data: { status: "DELETED" as any } });
    }
  }

  private async createFailureNotification(businessId: string, backupId: string, message: string) {
    const owners = await this.prisma.businessMember.findMany({
      where: { businessId, status: "ACTIVE", role: "OWNER", userId: { not: null } },
      select: { userId: true }
    });
    if (owners.length === 0) return;
    const notification = await (this.prisma as any).notification.create({
      data: {
        businessId,
        type: "SYSTEM",
        severity: "CRITICAL",
        title: "Backup ล้มเหลว",
        body: message,
        actionHref: "/app/data-backup",
        entityType: "BackupRecord",
        entityId: backupId
      }
    });
    await (this.prisma as any).notificationRecipient.createMany({
      data: owners.map((owner) => ({ notificationId: notification.id, userId: owner.userId! })),
      skipDuplicates: true
    });
  }

  private serialize(row: any) {
    return {
      id: row.id,
      status: row.status,
      scope: row.scope,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      checksum: row.checksum,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
      errorMessage: row.errorMessage
    };
  }
}
