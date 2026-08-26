-- ─────────────────────────────────────────────────────────────────────────
-- Project: Concept Design / About This Project section images.
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
-- Purely additive: two new nullable columns on an existing table, nothing
-- else touched. No backfill needed here — prisma/seed.ts's upsert fills
-- them in for existing rows on the next `prisma db seed` run.
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "conceptDesignImageUrl" TEXT;
ALTER TABLE "projects" ADD COLUMN "aboutThisProjectImageUrl" TEXT;
