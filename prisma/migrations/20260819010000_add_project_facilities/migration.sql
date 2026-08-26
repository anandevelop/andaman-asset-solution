-- ─────────────────────────────────────────────────────────────────────────
-- ProjectFacility — full-bleed photo cards under "Facilities" on the
-- project page, replacing the plain icon+label cards that read
-- Project.facilities (String[]) directly.
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
-- Two parts:
--   1. CreateTable — one new child table, FK'd to projects.
--   2. Backfill — one ProjectFacility row per existing entry in each
--      project's `facilities` array, so no data is lost when the public
--      page stops reading that column. `facilities` itself is left in
--      place (now documented `@deprecated` in schema.prisma) rather than
--      dropped, in case anything else still reads it.
--
-- The backfill maps each known facility key to the same EN/TH display
-- text already shown via next-intl's `projects.facilities.*` keys (see
-- messages/en.json / messages/th.json) — SQL has no access to those JSON
-- files, so the mapping is duplicated here as a CASE. Any key outside this
-- fixed list (there shouldn't be one — see FACILITY_ICON in
-- app/[locale]/(site)/projects/[slug]/page.tsx, the only place that ever
-- wrote into `facilities`) falls back to the raw key itself rather than
-- being dropped, so nothing silently disappears.
--
-- imageUrl is left NULL for every backfilled row — the public card
-- already renders a tinted placeholder + icon when it's null (see the
-- Facilities section on the project page), and an admin fills in real
-- photos afterwards via the new /admin/projects/[id]/facilities CRUD.
--
-- gen_random_uuid() is built into Postgres core as of v13 (no pgcrypto
-- extension needed) — used here only because this is a one-time raw-SQL
-- INSERT; every other row in this table is created through Prisma Client,
-- which uses the `cuid()` default instead.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "project_facilities" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_facilities_projectId_nameEn_key" ON "project_facilities"("projectId", "nameEn");

-- CreateIndex
CREATE INDEX "project_facilities_projectId_isActive_sortOrder_idx" ON "project_facilities"("projectId", "isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "project_facilities" ADD CONSTRAINT "project_facilities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one row per existing Project.facilities[] entry.
INSERT INTO "project_facilities" ("id", "projectId", "nameEn", "nameTh", "sortOrder", "updatedAt")
SELECT
    gen_random_uuid()::text,
    p."id",
    CASE f.value
        WHEN 'clubhouse'     THEN 'Clubhouse'
        WHEN 'fitness'       THEN 'Fitness Center'
        WHEN 'security'      THEN '24-hr Security'
        WHEN 'pool'          THEN 'Communal Pool'
        WHEN 'garden'        THEN 'Landscaped Garden'
        WHEN 'concierge'     THEN 'Concierge'
        WHEN 'coworking'     THEN 'Co-working Space'
        WHEN 'reception'     THEN 'Reception'
        WHEN 'restaurant'    THEN 'Restaurant'
        WHEN 'spa'           THEN 'Spa'
        WHEN 'lounge'        THEN 'Lounge'
        WHEN 'joggingTrack'  THEN 'Jogging Track'
        ELSE f.value
    END,
    CASE f.value
        WHEN 'clubhouse'     THEN 'คลับเฮาส์'
        WHEN 'fitness'       THEN 'ฟิตเนส'
        WHEN 'security'      THEN 'รักษาความปลอดภัย 24 ชม.'
        WHEN 'pool'          THEN 'สระว่ายน้ำส่วนกลาง'
        WHEN 'garden'        THEN 'สวนภูมิทัศน์'
        WHEN 'concierge'     THEN 'บริการคอนเซียร์จ'
        WHEN 'coworking'     THEN 'พื้นที่โคเวิร์กกิ้ง'
        WHEN 'reception'     THEN 'รีเซปชั่น'
        WHEN 'restaurant'    THEN 'ร้านอาหาร'
        WHEN 'spa'           THEN 'สปา'
        WHEN 'lounge'        THEN 'เลานจ์'
        WHEN 'joggingTrack'  THEN 'ลู่วิ่งจ็อกกิ้ง'
        ELSE f.value
    END,
    f.ordinality - 1,
    CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN LATERAL unnest(p."facilities") WITH ORDINALITY AS f("value", "ordinality")
WHERE p."deletedAt" IS NULL
ON CONFLICT ("projectId", "nameEn") DO NOTHING;
