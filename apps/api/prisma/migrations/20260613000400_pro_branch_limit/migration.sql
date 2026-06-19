UPDATE "SubscriptionPlan"
SET "branchLimit" = 5
WHERE "code" = 'PRO' AND "branchLimit" < 5;
