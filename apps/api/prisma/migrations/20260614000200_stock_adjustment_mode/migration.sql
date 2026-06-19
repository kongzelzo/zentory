CREATE TYPE "AdjustmentMode" AS ENUM ('SET_ACTUAL', 'INCREASE', 'DECREASE');

ALTER TABLE "StockAdjustment"
ADD COLUMN "adjustmentMode" "AdjustmentMode",
ADD COLUMN "targetQuantity" INTEGER;

ALTER TABLE "StockMovement"
ADD COLUMN "adjustmentMode" "AdjustmentMode",
ADD COLUMN "targetQuantity" INTEGER;
