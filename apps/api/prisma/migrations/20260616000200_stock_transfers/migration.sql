ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_CANCEL';

CREATE TYPE "StockTransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELED');

CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "sourceWarehouseId" TEXT NOT NULL,
  "destinationWarehouseId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "receivedById" TEXT,
  "canceledById" TEXT,
  "documentNo" TEXT NOT NULL,
  "status" "StockTransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockTransferItem" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockTransfer_businessId_documentNo_key" ON "StockTransfer"("businessId", "documentNo");
CREATE INDEX "StockTransfer_businessId_status_createdAt_idx" ON "StockTransfer"("businessId", "status", "createdAt");
CREATE INDEX "StockTransfer_sourceWarehouseId_idx" ON "StockTransfer"("sourceWarehouseId");
CREATE INDEX "StockTransfer_destinationWarehouseId_idx" ON "StockTransfer"("destinationWarehouseId");
CREATE INDEX "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");
CREATE INDEX "StockTransferItem_productId_idx" ON "StockTransferItem"("productId");

ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
