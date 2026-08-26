-- ─────────────────────────────────────────────────────────────────────────
-- "Our Sales" team section — one new, standalone table.
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
-- describes. Purely additive: one new table, no relations to anything
-- else, so nothing existing is touched.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "sales_people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_people_whatsappNumber_key" ON "sales_people"("whatsappNumber");

-- CreateIndex
CREATE INDEX "sales_people_isActive_sortOrder_idx" ON "sales_people"("isActive", "sortOrder");
