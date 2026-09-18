-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "lsiTerms" TEXT[] DEFAULT ARRAY[]::TEXT[];
