-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('CLIP', 'UGC', 'MUSIC_PROMO', 'CHALLENGE', 'AFFILIATE');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "type" "CampaignType" NOT NULL DEFAULT 'CLIP',
ADD COLUMN     "typeConfig" JSONB,
ADD COLUMN     "validationRules" JSONB;

-- AlterTable
ALTER TABLE "participations" ADD COLUMN     "lastMetricsSync" TIMESTAMP(3),
ADD COLUMN     "submissionDetails" JSONB,
ADD COLUMN     "submissionStatus" TEXT DEFAULT 'PENDING',
ADD COLUMN     "submissionUrl" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reels" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "participationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "platform" "Platform" NOT NULL,
    "username" TEXT NOT NULL,
    "profileUrl" TEXT,
    "avatarUrl" TEXT,
    "instagramUserId" TEXT,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "verificationCode" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_username_key" ON "social_accounts"("username");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_profileUrl_key" ON "social_accounts"("profileUrl");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_instagramUserId_key" ON "social_accounts"("instagramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_verificationCode_key" ON "social_accounts"("verificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_userId_platform_username_key" ON "social_accounts"("userId", "platform", "username");

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
