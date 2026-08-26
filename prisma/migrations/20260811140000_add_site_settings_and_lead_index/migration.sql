-- ─────────────────────────────────────────────────────────────────────────
-- Phase 10 — site settings and a report-shaped lead index.
--
-- Hand-written; verify with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema-datamodel prisma/schema.prisma \
--       --shadow-database-url "$SHADOW_DATABASE_URL" \
--       --exit-code
--
-- Additive only: one new table and one new index. Nothing dropped, so the
-- previous release keeps running against a migrated database.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "site_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
--
-- Complements the existing (status, createdAt). Postgres can only seek on a
-- leading column, so a report filtering "last 12 months" cannot use that one
-- without walking every status bucket. This index leads with the date.
--
-- On a large table use CREATE INDEX CONCURRENTLY instead — it does not take
-- an exclusive lock. Prisma cannot run it inside its migration transaction,
-- so it would be applied by hand outside the migration.
CREATE INDEX "lead_inquiries_createdAt_status_idx" ON "lead_inquiries"("createdAt", "status");
