-- ─────────────────────────────────────────────────────────────────────────
-- Phase 9 — testimonials, FAQs and the project brochure field.
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
-- Exit code 0 means this file leaves the database in the state the schema
-- describes. Anything else means they have diverged.
--
-- Every change here is additive: a new nullable column and two new tables.
-- Nothing is dropped or renamed, so the previous release keeps running
-- against a migrated database and this can be applied before the deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "brochureUrl" TEXT;

-- CreateTable
CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "roleEn" TEXT,
    "roleTh" TEXT,
    "contentEn" TEXT NOT NULL,
    "contentTh" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "rating" INTEGER,
    "projectId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "questionEn" TEXT NOT NULL,
    "questionTh" TEXT NOT NULL,
    "answerEn" TEXT NOT NULL,
    "answerTh" TEXT NOT NULL,
    "category" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "testimonials_isPublished_sortOrder_idx" ON "testimonials"("isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "testimonials_projectId_idx" ON "testimonials"("projectId");

-- CreateIndex
CREATE INDEX "faqs_isPublished_category_sortOrder_idx" ON "faqs"("isPublished", "category", "sortOrder");

-- AddForeignKey
-- SET NULL, not CASCADE: deleting a project must not silently destroy an
-- owner's testimonial. It loses its link and stays available as a general
-- quote.
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
