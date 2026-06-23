INSERT INTO "SubscriptionPlan" ("id", "code", "name", "productLimit", "userLimit", "branchLimit", "warehouseLimit", "priceMonthly", "isActive")
VALUES
  ('plan_starter', 'STARTER', 'Starter', 200, 2, 1, 1, 399, true),
  ('plan_professional', 'PROFESSIONAL', 'Professional', 1500, 6, 1, 2, 899, true),
  ('plan_multi_branch', 'MULTI_BRANCH', 'Multi-Branch', 3000, 12, 2, 4, 1790, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "productLimit" = EXCLUDED."productLimit",
  "userLimit" = EXCLUDED."userLimit",
  "branchLimit" = EXCLUDED."branchLimit",
  "warehouseLimit" = EXCLUDED."warehouseLimit",
  "priceMonthly" = EXCLUDED."priceMonthly",
  "isActive" = true;

WITH legacy AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'FREE'),
target AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'STARTER')
UPDATE "BusinessSubscription"
SET "planId" = target."id"
FROM legacy, target
WHERE "BusinessSubscription"."planId" = legacy."id";

WITH legacy AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'PRO'),
target AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'PROFESSIONAL')
UPDATE "BusinessSubscription"
SET "planId" = target."id"
FROM legacy, target
WHERE "BusinessSubscription"."planId" = legacy."id";

WITH legacy AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'PREMIUM'),
target AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'MULTI_BRANCH')
UPDATE "BusinessSubscription"
SET "planId" = target."id"
FROM legacy, target
WHERE "BusinessSubscription"."planId" = legacy."id";

WITH legacy AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'FREE'),
target AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'STARTER')
UPDATE "AccountPaymentRequest"
SET "planId" = target."id"
FROM legacy, target
WHERE "AccountPaymentRequest"."planId" = legacy."id";

WITH legacy AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'PRO'),
target AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'PROFESSIONAL')
UPDATE "AccountPaymentRequest"
SET "planId" = target."id"
FROM legacy, target
WHERE "AccountPaymentRequest"."planId" = legacy."id";

WITH legacy AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'PREMIUM'),
target AS (SELECT "id" FROM "SubscriptionPlan" WHERE "code" = 'MULTI_BRANCH')
UPDATE "AccountPaymentRequest"
SET "planId" = target."id"
FROM legacy, target
WHERE "AccountPaymentRequest"."planId" = legacy."id";

UPDATE "SubscriptionPlan"
SET "name" = 'Legacy Free', "isActive" = false
WHERE "code" = 'FREE';

UPDATE "SubscriptionPlan"
SET "name" = 'Legacy Pro', "isActive" = false
WHERE "code" = 'PRO';

UPDATE "SubscriptionPlan"
SET "name" = 'Legacy Premium', "isActive" = false
WHERE "code" = 'PREMIUM';
