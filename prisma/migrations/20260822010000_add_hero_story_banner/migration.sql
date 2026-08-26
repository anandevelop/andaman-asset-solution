-- ─────────────────────────────────────────────────────────────────────────
-- HeroStorySlide / HeroStorySlideTranslation — homepage IG-Stories-style
-- hero banner. Purely additive: two new tables, no relations to anything
-- existing, so nothing already in the database is touched.
--
-- Written by hand rather than generated, so read it before applying.
-- Verify against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema-datamodel prisma/schema.prisma \
--       --shadow-database-url "$SHADOW_DATABASE_URL" \
--       --exit-code
--
-- Unlike awards/faqs, this is a brand-new model created after the 4-locale
-- Translation-table pattern was already in place — there is no deprecated
-- EN/TH column pair to carry and therefore no backfill INSERT here; every
-- row starts out empty until an admin adds slides through /admin/hero-banner.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "HeroStoryMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "hero_story_slides" (
    "id" TEXT NOT NULL,
    "mediaType" "HeroStoryMediaType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "posterImageUrl" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 5,
    "ctaUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_story_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hero_story_slides_isActive_sortOrder_idx" ON "hero_story_slides"("isActive", "sortOrder");

-- CreateTable
CREATE TABLE "hero_story_slide_translations" (
    "id" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "caption" TEXT,
    "ctaLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_story_slide_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hero_story_slide_translations_slideId_locale_key" ON "hero_story_slide_translations"("slideId", "locale");

-- AddForeignKey
ALTER TABLE "hero_story_slide_translations" ADD CONSTRAINT "hero_story_slide_translations_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "hero_story_slides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
