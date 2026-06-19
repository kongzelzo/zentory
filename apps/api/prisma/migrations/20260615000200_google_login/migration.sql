ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
