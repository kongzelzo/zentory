ALTER TABLE "StockMovement" ADD COLUMN "balanceBefore" INTEGER;

CREATE UNIQUE INDEX "Product_businessId_barcode_key" ON "Product"("businessId", "barcode");
