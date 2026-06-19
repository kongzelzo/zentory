-- Extend stock transfer workflow with request/source approval/destination confirmation states.
ALTER TYPE "StockTransferStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "StockTransferStatus" ADD VALUE IF NOT EXISTS 'SOURCE_APPROVED';
ALTER TYPE "StockTransferStatus" ADD VALUE IF NOT EXISTS 'SOURCE_REJECTED';

ALTER TABLE "StockTransfer"
  ADD COLUMN IF NOT EXISTS "requestedById" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceApprovedById" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRejectedById" TEXT,
  ADD COLUMN IF NOT EXISTS "destinationConfirmedById" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sourceRejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "destinationConfirmedAt" TIMESTAMP(3);

UPDATE "StockTransfer"
SET "requestedById" = COALESCE("requestedById", "createdById")
WHERE "requestedById" IS NULL;

ALTER TABLE "StockTransfer"
  ALTER COLUMN "status" SET DEFAULT 'REQUESTED';

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockTransfer_sourceApprovedById_fkey" FOREIGN KEY ("sourceApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockTransfer_sourceRejectedById_fkey" FOREIGN KEY ("sourceRejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockTransfer_destinationConfirmedById_fkey" FOREIGN KEY ("destinationConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
