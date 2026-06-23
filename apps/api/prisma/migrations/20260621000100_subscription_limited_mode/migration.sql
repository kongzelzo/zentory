ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'LIMITED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

ALTER TABLE "BusinessSubscription"
  ADD COLUMN "graceEndsAt" TIMESTAMP(3),
  ADD COLUMN "selectedFreeBranchId" TEXT,
  ADD COLUMN "selectedFreeWarehouseId" TEXT;

CREATE INDEX "BusinessSubscription_status_graceEndsAt_idx" ON "BusinessSubscription"("status", "graceEndsAt");
