-- ─────────────────────────────────────────────────────────────────────────
-- EventTranslation — same expand-migration pattern as
-- prisma/migrations/20260820010000_add_i18n_translation_tables (see that
-- file's header for the full rationale) and
-- prisma/migrations/20260821010000_add_faq_translations (Faq's own
-- follow-up for the same reason). Event slipped through the original
-- 9-model i18n pass the same way Faq did, so it gets its own follow-up
-- migration here instead of a retroactive edit to an already-applied one.
--
-- titleEn/titleTh stay in place, marked @deprecated in schema.prisma.
-- Both are NOT NULL, so both locale rows are backfilled unconditionally.
-- descriptionEn/descriptionTh are nullable — same as NewsArticle's
-- excerptEn/excerptTh — so a NULL description backfills as a NULL
-- "description" row rather than being skipped.
--
-- Sandbox note (see every prior migration in this repo): this could not be
-- generated with `prisma migrate dev` — no network access to Prisma's
-- binary CDN here. Verify against a real database with:
--   npx prisma migrate diff --shadow-database-url <url> --exit-code
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "event_translations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_translations_eventId_locale_key" ON "event_translations"("eventId", "locale");

-- AddForeignKey
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: titleEn/titleTh are both required, so both rows are unconditional.
INSERT INTO "event_translations" ("id", "eventId", "locale", "title", "description", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'en', e."titleEn", e."descriptionEn", CURRENT_TIMESTAMP
FROM "events" e
ON CONFLICT ("eventId", "locale") DO NOTHING;

INSERT INTO "event_translations" ("id", "eventId", "locale", "title", "description", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'th', e."titleTh", e."descriptionTh", CURRENT_TIMESTAMP
FROM "events" e
ON CONFLICT ("eventId", "locale") DO NOTHING;
