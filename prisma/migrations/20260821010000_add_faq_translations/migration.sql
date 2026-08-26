-- ─────────────────────────────────────────────────────────────────────────
-- FaqTranslation — same expand-migration pattern as
-- prisma/migrations/20260820010000_add_i18n_translation_tables (see that
-- file's header for the full rationale). Faq was not part of that pass —
-- it slipped through because it predates the 9-model list the original
-- task named — so it gets its own follow-up migration here instead of a
-- retroactive edit to an already-applied one.
--
-- questionEn/questionTh/answerEn/answerTh stay in place, marked
-- @deprecated in schema.prisma. Both en and th rows are backfilled
-- unconditionally: all four deprecated columns are NOT NULL on Faq, so
-- there is no "untranslated" case to skip here (unlike, say,
-- NearbyAttractionItem.nameTh, which is nullable).
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "faq_translations" (
    "id" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faq_translations_faqId_locale_key" ON "faq_translations"("faqId", "locale");

-- AddForeignKey
ALTER TABLE "faq_translations" ADD CONSTRAINT "faq_translations_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: questionEn/questionTh/answerEn/answerTh are all required, so
-- both locale rows are unconditional.
INSERT INTO "faq_translations" ("id", "faqId", "locale", "question", "answer", "updatedAt")
SELECT gen_random_uuid()::text, f."id", 'en', f."questionEn", f."answerEn", CURRENT_TIMESTAMP
FROM "faqs" f
ON CONFLICT ("faqId", "locale") DO NOTHING;

INSERT INTO "faq_translations" ("id", "faqId", "locale", "question", "answer", "updatedAt")
SELECT gen_random_uuid()::text, f."id", 'th', f."questionTh", f."answerTh", CURRENT_TIMESTAMP
FROM "faqs" f
ON CONFLICT ("faqId", "locale") DO NOTHING;
