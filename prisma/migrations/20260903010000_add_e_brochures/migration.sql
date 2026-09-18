-- ─────────────────────────────────────────────────────────────────────────
-- EBrochure / EBrochureTranslation — the PDF flipbook at /e-brochure/<slug>.
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
-- Additive. Two new tables and one nullable FK into "projects"; no existing
-- column changes type and no existing row is touched, so there is no
-- backfill. Every row starts out empty until an admin adds a brochure
-- through /admin/e-brochures — the same shape as the hero story banner.
--
-- The FK to "projects" is ON DELETE SET NULL, not CASCADE. Deleting a
-- project must not silently take its brochures with it: the PDF and its
-- four locales of copy are still real content, they have only lost their
-- parent. Note "projects" is soft-deleted (deletedAt) in the application,
-- so this branch is reached only by a genuine hard DELETE.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "e_brochures" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "projectId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "e_brochures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "e_brochures_slug_key" ON "e_brochures"("slug");

-- CreateIndex
CREATE INDEX "e_brochures_isPublished_sortOrder_idx" ON "e_brochures"("isPublished", "sortOrder");

-- CreateTable
CREATE TABLE "e_brochure_translations" (
    "id" TEXT NOT NULL,
    "brochureId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "e_brochure_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "e_brochure_translations_brochureId_locale_key" ON "e_brochure_translations"("brochureId", "locale");

-- AddForeignKey
ALTER TABLE "e_brochures" ADD CONSTRAINT "e_brochures_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "e_brochure_translations" ADD CONSTRAINT "e_brochure_translations_brochureId_fkey" FOREIGN KEY ("brochureId") REFERENCES "e_brochures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
