ALTER TABLE "BusinessMember"
ADD COLUMN "permissionOverrides" JSONB NOT NULL DEFAULT '{}';
