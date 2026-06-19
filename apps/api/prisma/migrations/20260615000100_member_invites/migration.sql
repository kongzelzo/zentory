ALTER TABLE "BusinessMember" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "BusinessMember"
ADD COLUMN "inviteEmail" TEXT,
ADD COLUMN "inviteName" TEXT,
ADD COLUMN "inviteTokenHash" TEXT,
ADD COLUMN "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN "invitedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "BusinessMember_inviteTokenHash_key" ON "BusinessMember"("inviteTokenHash");
CREATE INDEX "BusinessMember_businessId_inviteEmail_idx" ON "BusinessMember"("businessId", "inviteEmail");
