-- ─────────────────────────────────────────────────────────────────────────
-- CompanyProfile.aboutHeroImageUrl — the About page header's new full-bleed
-- hero photo, alongside the existing storyImageUrl. Additive: one new
-- column with a default, so the single existing "default" row picks it up
-- with no backfill, and every other row (there is only ever one) is
-- unaffected.
--
-- Verify against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema prisma/schema.prisma \
--       --exit-code
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "company_profile" ADD COLUMN "aboutHeroImageUrl" TEXT NOT NULL DEFAULT '/gallery/trinity-village/pool-garden.webp';
