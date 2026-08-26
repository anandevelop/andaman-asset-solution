-- Rich project content (Sale-Kit parity) + shared company profile.
--
-- Verify against schema.prisma before applying to a real database:
--   npx prisma migrate diff \
--     --from-migrations ./prisma/migrations \
--     --to-schema-datamodel ./prisma/schema.prisma \
--     --shadow-database-url "$SHADOW_DATABASE_URL" \
--     --script
-- The output should be empty (this migration already matches the schema).
--
-- Hand-written, like the two migrations before it — this sandbox has no
-- network access to download the Prisma engine binary, so `prisma migrate
-- dev` cannot run here. Written to mirror exactly what that command would
-- generate from the schema.prisma diff.
--
-- Does NOT touch project_unit_types / floor_plans / project_units /
-- project_attractions / UnitStatus — those were created by migration
-- 20260812044232 and already exist in the database. This migration only
-- adds what's new in this phase.

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "conceptDesignEn" TEXT,
ADD COLUMN     "conceptDesignTh" TEXT,
ADD COLUMN     "aboutThisProjectEn" TEXT,
ADD COLUMN     "aboutThisProjectTh" TEXT,
ADD COLUMN     "specialFeatures" JSONB;

-- CreateTable
CREATE TABLE "nearby_attraction_categories" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "categoryNameEn" TEXT NOT NULL,
    "categoryNameTh" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_attraction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nearby_attraction_items" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTh" TEXT,
    "distanceKm" DECIMAL(6,2) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_attraction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "aboutUsEn" TEXT NOT NULL,
    "aboutUsTh" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nearby_attraction_categories_projectId_sortOrder_idx" ON "nearby_attraction_categories"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "nearby_attraction_items_categoryId_sortOrder_idx" ON "nearby_attraction_items"("categoryId", "sortOrder");

-- AddForeignKey
ALTER TABLE "nearby_attraction_categories" ADD CONSTRAINT "nearby_attraction_categories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nearby_attraction_items" ADD CONSTRAINT "nearby_attraction_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "nearby_attraction_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
