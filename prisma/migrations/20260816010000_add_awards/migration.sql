-- ─────────────────────────────────────────────────────────────────────────
-- Awards section (home page) — one new, standalone table.
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
-- Purely additive: one new table, no relations to anything else, so
-- nothing existing is touched.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "awards" (
    "id" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleTh" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "projectName" TEXT,
    "year" INTEGER NOT NULL,
    "trophyImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "awards_organization_titleEn_year_key" ON "awards"("organization", "titleEn", "year");

-- CreateIndex
CREATE INDEX "awards_isActive_sortOrder_idx" ON "awards"("isActive", "sortOrder");
