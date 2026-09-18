-- AlterTable
ALTER TABLE "project_translations" ADD COLUMN     "targetKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "sitemapChangeFreq" TEXT,
ADD COLUMN     "sitemapPriority" DOUBLE PRECISION;
