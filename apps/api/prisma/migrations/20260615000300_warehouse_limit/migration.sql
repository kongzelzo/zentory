ALTER TABLE "SubscriptionPlan" ADD COLUMN "warehouseLimit" INTEGER NOT NULL DEFAULT 1;

UPDATE "SubscriptionPlan"
SET "warehouseLimit" = CASE
  WHEN "code" = 'PRO' THEN 5
  ELSE 1
END;
