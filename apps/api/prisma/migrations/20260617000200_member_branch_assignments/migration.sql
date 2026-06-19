CREATE TABLE "BusinessMemberBranch" (
    "id" TEXT NOT NULL,
    "businessMemberId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessMemberBranch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessMemberBranch_businessMemberId_branchId_key" ON "BusinessMemberBranch"("businessMemberId", "branchId");
CREATE INDEX "BusinessMemberBranch_branchId_idx" ON "BusinessMemberBranch"("branchId");

ALTER TABLE "BusinessMemberBranch"
ADD CONSTRAINT "BusinessMemberBranch_businessMemberId_fkey"
FOREIGN KEY ("businessMemberId") REFERENCES "BusinessMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessMemberBranch"
ADD CONSTRAINT "BusinessMemberBranch_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BusinessMemberBranch" ("id", "businessMemberId", "branchId")
SELECT
  'cmb_' || md5(random()::text || clock_timestamp()::text || member."id" || branch."id"),
  member."id",
  branch."id"
FROM "BusinessMember" member
JOIN "Branch" branch ON branch."businessId" = member."businessId"
WHERE member."status" = 'ACTIVE'
  AND member."role" <> 'OWNER'
  AND branch."status" = 'ACTIVE'
ON CONFLICT ("businessMemberId", "branchId") DO NOTHING;
