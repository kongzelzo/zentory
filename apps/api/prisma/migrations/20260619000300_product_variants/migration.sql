-- Product variant groups keep Product as the sellable, stock-tracked SKU.
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "skuPrefix" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'ชิ้น',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product"
  ADD COLUMN "productGroupId" TEXT,
  ADD COLUMN "variantColor" TEXT,
  ADD COLUMN "variantSize" TEXT;

CREATE INDEX "ProductGroup_businessId_name_idx" ON "ProductGroup"("businessId", "name");
CREATE INDEX "ProductGroup_businessId_skuPrefix_idx" ON "ProductGroup"("businessId", "skuPrefix");
CREATE INDEX "Product_productGroupId_idx" ON "Product"("productGroupId");
CREATE INDEX "Product_businessId_variantColor_idx" ON "Product"("businessId", "variantColor");
CREATE INDEX "Product_businessId_variantSize_idx" ON "Product"("businessId", "variantSize");

ALTER TABLE "ProductGroup" ADD CONSTRAINT "ProductGroup_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductGroup" ADD CONSTRAINT "ProductGroup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductGroup" ADD CONSTRAINT "ProductGroup_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
