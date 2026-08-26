-- Add Project.heroMediaType + Project.heroVideoUrl: lets the admin choose
-- a video instead of a static photo for the project detail page's hero
-- background. Mirrors HeroStorySlide.mediaType/mediaUrl (see that model's
-- comment in schema.prisma) but reuses the existing heroImageUrl column as
-- the poster/fallback image rather than adding a third column, since a
-- project has exactly one hero (no poster-vs-slide distinction to make).
-- Reuses the "HeroStoryMediaType" enum type created by
-- 20260822010000_add_hero_story_banner — no new enum needed.
-- Purely additive — defaulted / nullable, no backfill needed.

ALTER TABLE "projects" ADD COLUMN "heroMediaType" "HeroStoryMediaType" NOT NULL DEFAULT 'IMAGE';
ALTER TABLE "projects" ADD COLUMN "heroVideoUrl" TEXT;
