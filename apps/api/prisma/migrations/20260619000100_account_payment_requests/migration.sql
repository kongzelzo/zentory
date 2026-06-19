CREATE TYPE "AccountPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED');

CREATE TABLE "AccountPaymentRequest" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessId" TEXT,
  "planId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "billingCycle" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'THB',
  "status" "AccountPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL DEFAULT 'manual',
  "providerPaymentId" TEXT,
  "checkoutUrl" TEXT,
  "paidAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountPaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountPaymentRequest_reference_key" ON "AccountPaymentRequest"("reference");
CREATE INDEX "AccountPaymentRequest_userId_createdAt_idx" ON "AccountPaymentRequest"("userId", "createdAt");
CREATE INDEX "AccountPaymentRequest_businessId_createdAt_idx" ON "AccountPaymentRequest"("businessId", "createdAt");
CREATE INDEX "AccountPaymentRequest_status_createdAt_idx" ON "AccountPaymentRequest"("status", "createdAt");
CREATE INDEX "AccountPaymentRequest_provider_providerPaymentId_idx" ON "AccountPaymentRequest"("provider", "providerPaymentId");

ALTER TABLE "AccountPaymentRequest"
ADD CONSTRAINT "AccountPaymentRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountPaymentRequest"
ADD CONSTRAINT "AccountPaymentRequest_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountPaymentRequest"
ADD CONSTRAINT "AccountPaymentRequest_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
