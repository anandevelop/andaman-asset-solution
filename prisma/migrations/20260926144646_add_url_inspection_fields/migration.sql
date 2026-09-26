-- AlterTable
ALTER TABLE "seo_url_states" ADD COLUMN     "coverageState" TEXT,
ADD COLUMN     "googleCanonical" TEXT,
ADD COLUMN     "inspectedAt" TIMESTAMP(3),
ADD COLUMN     "lastCrawledAt" TIMESTAMP(3);
