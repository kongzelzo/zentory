UPDATE "AccountPaymentRequest"
SET "planCode" = 'STARTER'
WHERE "planCode" = 'FREE';

UPDATE "AccountPaymentRequest"
SET "planCode" = 'PROFESSIONAL'
WHERE "planCode" = 'PRO';

UPDATE "AccountPaymentRequest"
SET "planCode" = 'MULTI_BRANCH'
WHERE "planCode" = 'PREMIUM';
