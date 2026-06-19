CREATE TYPE "SalesTargetMode" AS ENUM ('ANNUAL', 'MONTHLY', 'DAILY');
ALTER TABLE "Business" ADD COLUMN "salesTargetMode" "SalesTargetMode" NOT NULL DEFAULT 'ANNUAL';
