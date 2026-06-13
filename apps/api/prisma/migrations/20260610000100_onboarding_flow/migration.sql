ALTER TABLE "Business"
ADD COLUMN "branchCount" TEXT NOT NULL DEFAULT '1',
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingProgress" JSONB NOT NULL DEFAULT '{}';
