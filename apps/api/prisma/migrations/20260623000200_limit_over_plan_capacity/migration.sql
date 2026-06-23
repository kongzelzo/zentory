UPDATE "BusinessSubscription" AS subscription
SET "status" = 'LIMITED'
FROM "SubscriptionPlan" AS plan
WHERE subscription."planId" = plan."id"
  AND subscription."status" = 'ACTIVE'
  AND (
    (SELECT COUNT(*) FROM "Branch" WHERE "businessId" = subscription."businessId" AND "status" = 'ACTIVE') > plan."branchLimit"
    OR (SELECT COUNT(*) FROM "Warehouse" WHERE "businessId" = subscription."businessId" AND "status" = 'ACTIVE') > plan."warehouseLimit"
    OR (SELECT COUNT(*) FROM "BusinessMember" WHERE "businessId" = subscription."businessId" AND "status" = 'ACTIVE') > plan."userLimit"
    OR (SELECT COUNT(*) FROM "Product" WHERE "businessId" = subscription."businessId" AND "status" IN ('ACTIVE', 'PAUSED', 'DISCONTINUED')) > plan."productLimit"
  );
