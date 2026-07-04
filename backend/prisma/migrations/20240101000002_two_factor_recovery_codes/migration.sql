-- AlterTable
ALTER TABLE "User" ADD COLUMN "twoFactorRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
