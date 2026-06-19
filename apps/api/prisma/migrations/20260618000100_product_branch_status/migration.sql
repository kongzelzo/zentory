CREATE TABLE "ProductBranchStatus" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBranchStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductBranchStatus_businessId_productId_branchId_key" ON "ProductBranchStatus"("businessId", "productId", "branchId");
CREATE INDEX "ProductBranchStatus_businessId_branchId_status_idx" ON "ProductBranchStatus"("businessId", "branchId", "status");
CREATE INDEX "ProductBranchStatus_productId_idx" ON "ProductBranchStatus"("productId");

ALTER TABLE "ProductBranchStatus"
ADD CONSTRAINT "ProductBranchStatus_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductBranchStatus"
ADD CONSTRAINT "ProductBranchStatus_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductBranchStatus"
ADD CONSTRAINT "ProductBranchStatus_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
