/*
  Warnings:

  - You are about to drop the column `userId` on the `campaigns` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_userId_fkey";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "userId";
