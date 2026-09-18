-- CreateEnum
CREATE TYPE "LeadNoteKind" AS ENUM ('NOTE', 'CALL', 'EMAIL');

-- AlterTable
ALTER TABLE "lead_inquiries" ADD COLUMN     "commsLanguage" TEXT,
ADD COLUMN     "housePreference" TEXT,
ADD COLUMN     "sourcePath" TEXT;

-- AlterTable
ALTER TABLE "lead_notes" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "kind" "LeadNoteKind" NOT NULL DEFAULT 'NOTE';
