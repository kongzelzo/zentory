-- Create warehouse-specific enums before moving legacy branch rows.
CREATE TYPE "WarehouseType" AS ENUM ('MAIN_WAREHOUSE', 'STORE_FRONT', 'BRANCH_WAREHOUSE', 'SECONDARY_WAREHOUSE');
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- Keep old Branch ids as Warehouse ids so legacy stock references can be moved directly.
CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "WarehouseType" NOT NULL DEFAULT 'BRANCH_WAREHOUSE',
  "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
  "address" TEXT,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "note" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Branch" ADD COLUMN "legacyWarehouseBranchId" TEXT;

WITH old_branches AS (
  SELECT
    "id",
    "businessId",
    ROW_NUMBER() OVER (
      PARTITION BY "businessId"
      ORDER BY "isDefault" DESC, "createdAt" ASC, "id" ASC
    ) AS branch_rank
  FROM "Branch"
),
main_branches AS (
  INSERT INTO "Branch" (
    "id",
    "businessId",
    "name",
    "code",
    "status",
    "address",
    "contactName",
    "contactPhone",
    "note",
    "isDefault",
    "createdAt",
    "legacyWarehouseBranchId"
  )
  SELECT
    'branch_main_' || "businessId",
    "businessId",
    'สาขาหลัก',
    'MAIN',
    'ACTIVE'::"BranchStatus",
    NULL,
    NULL,
    NULL,
    'สร้างอัตโนมัติจาก migration แยกสาขาและคลัง',
    true,
    CURRENT_TIMESTAMP,
    "id"
  FROM old_branches
  WHERE branch_rank = 1
  ON CONFLICT ("businessId", "code") DO UPDATE
  SET
    "name" = EXCLUDED."name",
    "isDefault" = true,
    "legacyWarehouseBranchId" = EXCLUDED."legacyWarehouseBranchId"
  RETURNING "id", "businessId", "legacyWarehouseBranchId"
)
INSERT INTO "Warehouse" (
  "id",
  "businessId",
  "branchId",
  "name",
  "code",
  "type",
  "status",
  "address",
  "contactName",
  "contactPhone",
  "note",
  "isDefault",
  "createdAt"
)
SELECT
  old_branch."id",
  old_branch."businessId",
  main_branch."id",
  old_branch."name",
  old_branch."code",
  CASE old_branch."type"::TEXT
    WHEN 'BRANCH' THEN 'BRANCH_WAREHOUSE'::"WarehouseType"
    ELSE old_branch."type"::TEXT::"WarehouseType"
  END,
  old_branch."status"::TEXT::"WarehouseStatus",
  old_branch."address",
  old_branch."contactName",
  old_branch."contactPhone",
  old_branch."note",
  old_branch."isDefault",
  old_branch."createdAt"
FROM "Branch" old_branch
JOIN main_branches main_branch ON main_branch."businessId" = old_branch."businessId"
WHERE old_branch."legacyWarehouseBranchId" IS NULL;

-- Move stock references from legacy branchId columns to warehouseId columns.
ALTER TABLE "InventoryBalance" RENAME COLUMN "branchId" TO "warehouseId";
ALTER TABLE "StockMovement" RENAME COLUMN "branchId" TO "warehouseId";
ALTER TABLE "StockReceipt" RENAME COLUMN "branchId" TO "warehouseId";
ALTER TABLE "StockAdjustment" RENAME COLUMN "branchId" TO "warehouseId";
ALTER TABLE "Sale" RENAME COLUMN "branchId" TO "warehouseId";
ALTER TABLE "Sale" ADD COLUMN "branchId" TEXT;

UPDATE "Sale"
SET "branchId" = main_branch."id"
FROM "Warehouse" warehouse
JOIN "Branch" main_branch ON main_branch."id" = warehouse."branchId"
WHERE "Sale"."warehouseId" = warehouse."id";

ALTER TABLE "Sale" ALTER COLUMN "branchId" SET NOT NULL;

-- Remove legacy warehouse rows from Branch after all references have been moved.
DELETE FROM "Branch"
WHERE "legacyWarehouseBranchId" IS NULL;

ALTER TABLE "Branch" DROP COLUMN "type";
ALTER TABLE "Branch" DROP COLUMN "legacyWarehouseBranchId";

-- Replace old unique/index names after the delete/drop step.
DROP INDEX IF EXISTS "InventoryBalance_businessId_branchId_productId_key";
DROP INDEX IF EXISTS "Branch_businessId_code_key";

CREATE UNIQUE INDEX "Branch_businessId_code_key" ON "Branch"("businessId", "code");
CREATE INDEX "Warehouse_businessId_idx" ON "Warehouse"("businessId");
CREATE INDEX "Warehouse_branchId_idx" ON "Warehouse"("branchId");
CREATE UNIQUE INDEX "Warehouse_businessId_code_key" ON "Warehouse"("businessId", "code");
CREATE UNIQUE INDEX "InventoryBalance_businessId_warehouseId_productId_key" ON "InventoryBalance"("businessId", "warehouseId", "productId");

-- Swap foreign keys to the new tables/columns.
ALTER TABLE "InventoryBalance" DROP CONSTRAINT IF EXISTS "InventoryBalance_branchId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_branchId_fkey";
ALTER TABLE "StockReceipt" DROP CONSTRAINT IF EXISTS "StockReceipt_branchId_fkey";
ALTER TABLE "StockAdjustment" DROP CONSTRAINT IF EXISTS "StockAdjustment_branchId_fkey";
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_branchId_fkey";

ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TYPE "BranchType";
