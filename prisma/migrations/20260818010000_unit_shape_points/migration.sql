-- ─────────────────────────────────────────────────────────────────────────
-- ProjectUnit: replace the unused mapPolygon SVG-string column with
-- structured shapePoints (Json — array of {x,y} percentages) plus a
-- positionXPercent/Y anchor pair computed from that shape's centroid.
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
-- mapPolygon was added in 20260812044232 but nothing ever read or wrote
-- it — no admin UI, no public rendering — so dropping it loses no real
-- data. Safe to run without a backfill step.
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "project_units" DROP COLUMN "mapPolygon";
ALTER TABLE "project_units" ADD COLUMN "shapePoints" JSONB;
ALTER TABLE "project_units" ADD COLUMN "positionXPercent" DOUBLE PRECISION;
ALTER TABLE "project_units" ADD COLUMN "positionYPercent" DOUBLE PRECISION;
