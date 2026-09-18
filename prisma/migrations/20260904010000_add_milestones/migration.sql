-- ─────────────────────────────────────────────────────────────────────────
-- Milestone — the "How we got here" photo timeline on the About page,
-- moved out of content/company-timeline.ts into the database.
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
-- Additive: one new table, nothing existing touched. prisma/seed.ts
-- transcribes the old static array into this table on the next seed run.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "projectName" TEXT NOT NULL,
    "brand" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "milestones_year_projectName_key" ON "milestones"("year", "projectName");

-- CreateIndex
CREATE INDEX "milestones_isActive_year_sortOrder_idx" ON "milestones"("isActive", "year", "sortOrder");
