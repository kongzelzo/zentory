-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('MAIN_WAREHOUSE', 'STORE_FRONT', 'BRANCH', 'SECONDARY_WAREHOUSE');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Branch"
ADD COLUMN "code" TEXT,
ADD COLUMN "type" "BranchType" NOT NULL DEFAULT 'BRANCH',
ADD COLUMN "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "address" TEXT,
ADD COLUMN "contactName" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "note" TEXT;

-- Backfill existing branches without relying on names being ASCII.
-- Only the first default branch per business receives MAIN so the new
-- businessId/code unique index cannot fail on messy legacy data.
WITH ranked_branches AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "businessId"
      ORDER BY "isDefault" DESC, "createdAt" ASC, "id" ASC
    ) AS branch_rank
  FROM "Branch"
)
UPDATE "Branch"
SET
  "code" = CASE
    WHEN "Branch"."isDefault" = true AND ranked_branches.branch_rank = 1 THEN 'MAIN'
    ELSE 'BR-' || UPPER(SUBSTRING("Branch"."id" FROM 1 FOR 8))
  END,
  "type" = CASE
    WHEN "Branch"."isDefault" = true THEN 'MAIN_WAREHOUSE'::"BranchType"
    ELSE 'BRANCH'::"BranchType"
  END,
  "status" = 'ACTIVE'::"BranchStatus"
FROM ranked_branches
WHERE "Branch"."id" = ranked_branches."id";

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_businessId_code_key" ON "Branch"("businessId", "code");
