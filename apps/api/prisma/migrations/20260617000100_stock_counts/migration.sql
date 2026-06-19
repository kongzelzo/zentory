CREATE TYPE "StockCountStatus" AS ENUM ('COUNTING', 'REVIEW', 'APPLIED', 'CANCELED');

CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'COUNTING',
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQuantity" INTEGER NOT NULL,
    "countedQuantity" INTEGER,
    "difference" INTEGER,
    "note" TEXT,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockCount_businessId_documentNo_key" ON "StockCount"("businessId", "documentNo");
CREATE INDEX "StockCount_businessId_status_startedAt_idx" ON "StockCount"("businessId", "status", "startedAt");
CREATE INDEX "StockCount_warehouseId_status_idx" ON "StockCount"("warehouseId", "status");
CREATE UNIQUE INDEX "StockCountItem_stockCountId_productId_key" ON "StockCountItem"("stockCountId", "productId");
CREATE INDEX "StockCountItem_productId_idx" ON "StockCountItem"("productId");

ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
