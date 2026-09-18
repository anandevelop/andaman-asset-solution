-- ─────────────────────────────────────────────────────────────────────────
-- Content-studio schema: keyword targeting, cached SEO numbers, and the
-- infrastructure for the internal-link-health scan and a future keyword
-- library. Every new column is nullable or defaulted — existing rows are
-- untouched, and NewsArticle.contentFormat defaults every current row to
-- MARKDOWN (what they already are) so lib/markdown.ts keeps rendering
-- them exactly as before. HTML is for a future rich-text editor; nothing
-- writes it yet.
--
-- Verify against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema prisma/schema.prisma \
--       --exit-code
-- ─────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "ArticleFormat" AS ENUM ('MARKDOWN', 'HTML');

-- AlterTable
ALTER TABLE "news_article_translations" ADD COLUMN     "seoScore" INTEGER;

-- AlterTable
ALTER TABLE "news_articles" ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "contentFormat" "ArticleFormat" NOT NULL DEFAULT 'MARKDOWN',
ADD COLUMN     "focusKeyword" TEXT,
ADD COLUMN     "readingMinutes" INTEGER,
ADD COLUMN     "schemaType" TEXT DEFAULT 'NewsArticle',
ADD COLUMN     "secondaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoScore" INTEGER,
ADD COLUMN     "seoScoreAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "searchVolume" INTEGER,
    "difficulty" INTEGER,
    "currentRank" INTEGER,
    "previousRank" INTEGER,
    "rankCheckedAt" TIMESTAMP(3),
    "trend" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_assignments" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "keyword_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_links" (
    "id" TEXT NOT NULL,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromLocale" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "anchorText" TEXT,
    "isInternal" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "content_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "keywords_phrase_key" ON "keywords"("phrase");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_assignments_keywordId_contentType_contentId_locale_key" ON "keyword_assignments"("keywordId", "contentType", "contentId", "locale");

-- CreateIndex
CREATE INDEX "content_links_toPath_idx" ON "content_links"("toPath");

-- CreateIndex
CREATE INDEX "content_links_fromType_fromId_idx" ON "content_links"("fromType", "fromId");

-- AddForeignKey
ALTER TABLE "keyword_assignments" ADD CONSTRAINT "keyword_assignments_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
