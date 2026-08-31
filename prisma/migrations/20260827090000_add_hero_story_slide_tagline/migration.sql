-- ─────────────────────────────────────────────────────────────────────────
-- HeroStorySlideTranslation.tagline — a short line shown under the hero
-- slide's headline, same role as Project.tagline on an individual
-- project's own hero. Purely additive: one nullable column on a table
-- that already exists (see 20260822010000_add_hero_story_banner), so no
-- backfill and nothing else in the database is touched.
--
-- Written by hand rather than generated — no network access to Prisma's
-- binary CDN in this sandbox (same note as every prior migration in this
-- repo). Verify against a real database with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema-datamodel prisma/schema.prisma \
--       --shadow-database-url "$SHADOW_DATABASE_URL" \
--       --exit-code
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "hero_story_slide_translations" ADD COLUMN "tagline" TEXT;
