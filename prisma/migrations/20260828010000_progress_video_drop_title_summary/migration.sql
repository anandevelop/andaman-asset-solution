-- ─────────────────────────────────────────────────────────────────────────
-- ProjectProgress: drop titleEn/titleTh/summaryEn/summaryTh, add videoUrl.
--
-- The per-locale caption text on a monthly update never carried its own
-- weight next to the photo (and now video) gallery it sat above — the
-- admin brief was to remove the fields outright, not just stop requiring
-- them. Replaced with a single videoUrl column: an admin-pasted YouTube
-- link for that month's drone footage or site walkthrough, resolved to an
-- embeddable src by lib/youtube.ts.
--
-- Destructive on the four dropped columns — any existing title/summary
-- copy is lost, not archived. Confirmed acceptable: this is presentational
-- caption text with no other reference in the schema (unlike, say,
-- Award.titleEn, which participates in a unique constraint elsewhere).
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
ALTER TABLE "project_progress" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "project_progress" DROP COLUMN "titleEn";
ALTER TABLE "project_progress" DROP COLUMN "titleTh";
ALTER TABLE "project_progress" DROP COLUMN "summaryEn";
ALTER TABLE "project_progress" DROP COLUMN "summaryTh";
