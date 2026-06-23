CREATE TYPE "StockAdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "BackupStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'DELETED');

ALTER TABLE "StockAdjustment"
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "status" "StockAdjustmentStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "quantity" INTEGER,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

ALTER TABLE "StockAdjustment" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockAdjustment_businessId_status_createdAt_idx" ON "StockAdjustment"("businessId", "status", "createdAt");
CREATE INDEX "StockAdjustment_warehouseId_status_idx" ON "StockAdjustment"("warehouseId", "status");
CREATE INDEX "StockAdjustment_productId_idx" ON "StockAdjustment"("productId");

CREATE TABLE "BackupRecord" (
  "id" TEXT NOT NULL,
  "businessId" TEXT,
  "requestedById" TEXT,
  "status" "BackupStatus" NOT NULL DEFAULT 'RUNNING',
  "scope" TEXT NOT NULL DEFAULT 'SYSTEM',
  "storagePath" TEXT,
  "fileName" TEXT,
  "sizeBytes" INTEGER,
  "checksum" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BackupRecord"
  ADD CONSTRAINT "BackupRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BackupRecord_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BackupRecord_businessId_startedAt_idx" ON "BackupRecord"("businessId", "startedAt");
CREATE INDEX "BackupRecord_status_startedAt_idx" ON "BackupRecord"("status", "startedAt");
CREATE INDEX "BackupRecord_expiresAt_idx" ON "BackupRecord"("expiresAt");
