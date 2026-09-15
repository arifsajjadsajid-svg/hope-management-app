/*
  Warnings:

  - You are about to drop the column `failedAttempts` on the `parent_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `lockedUntil` on the `parent_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `mustChangePassword` on the `parent_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `parent_accounts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "parent_accounts" DROP COLUMN "failedAttempts",
DROP COLUMN "lockedUntil",
DROP COLUMN "mustChangePassword",
DROP COLUMN "passwordHash";
