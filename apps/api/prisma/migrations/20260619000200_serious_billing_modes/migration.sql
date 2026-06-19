CREATE TYPE "SubscriptionPaymentMode" AS ENUM ('FREE', 'STRIPE_SUBSCRIPTION', 'PROMPTPAY_ONE_TIME');

ALTER TABLE "BusinessSubscription"
ADD COLUMN "paymentMode" "SubscriptionPaymentMode" NOT NULL DEFAULT 'FREE',
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AccountPaymentRequest"
ADD COLUMN "checkoutMode" TEXT,
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT,
ADD COLUMN "stripeInvoiceId" TEXT,
ADD COLUMN "failureReason" TEXT;

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "objectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessSubscription_stripeCustomerId_idx" ON "BusinessSubscription"("stripeCustomerId");
CREATE INDEX "BusinessSubscription_stripeSubscriptionId_idx" ON "BusinessSubscription"("stripeSubscriptionId");
CREATE INDEX "BusinessSubscription_paymentMode_expiresAt_idx" ON "BusinessSubscription"("paymentMode", "expiresAt");
CREATE INDEX "AccountPaymentRequest_stripeCheckoutSessionId_idx" ON "AccountPaymentRequest"("stripeCheckoutSessionId");
CREATE INDEX "AccountPaymentRequest_stripePaymentIntentId_idx" ON "AccountPaymentRequest"("stripePaymentIntentId");
CREATE INDEX "AccountPaymentRequest_stripeInvoiceId_idx" ON "AccountPaymentRequest"("stripeInvoiceId");
CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");
CREATE INDEX "StripeWebhookEvent_eventType_createdAt_idx" ON "StripeWebhookEvent"("eventType", "createdAt");
