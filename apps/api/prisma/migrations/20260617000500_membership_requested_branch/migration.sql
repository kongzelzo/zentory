ALTER TABLE "BusinessMember"
ADD COLUMN "requestedBranchId" TEXT;

CREATE INDEX "BusinessMember_requestedBranchId_idx" ON "BusinessMember"("requestedBranchId");

ALTER TABLE "BusinessMember"
ADD CONSTRAINT "BusinessMember_requestedBranchId_fkey"
FOREIGN KEY ("requestedBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
