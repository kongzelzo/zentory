DELETE FROM "BusinessMember" WHERE "status" = 'INVITED';

DROP INDEX IF EXISTS "BusinessMember_inviteTokenHash_key";
DROP INDEX IF EXISTS "BusinessMember_businessId_inviteEmail_idx";

ALTER TABLE "BusinessMember"
DROP COLUMN IF EXISTS "inviteEmail",
DROP COLUMN IF EXISTS "inviteName",
DROP COLUMN IF EXISTS "inviteTokenHash",
DROP COLUMN IF EXISTS "inviteExpiresAt",
DROP COLUMN IF EXISTS "invitedAt";

ALTER TABLE "BusinessMember" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "MemberStatus" RENAME TO "MemberStatus_old";
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED', 'DISABLED');
ALTER TABLE "BusinessMember" ALTER COLUMN "status" TYPE "MemberStatus" USING ("status"::text::"MemberStatus");
ALTER TABLE "BusinessMember" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "MemberStatus_old";
