-- ─────────────────────────────────────────────────────────────────────────
-- NewsArticleTranslation.focusKeyword — the phrase this locale's version
-- of an article is written to rank for, feeding lib/seo-score.ts's
-- checklist and lib/keyword-density.ts in the news editor's SEO panel.
-- Per-locale, additive and nullable: a Thai keyword and its English
-- equivalent are different strings, and every existing row is simply
-- unset until an editor fills one in.
--
-- Verify against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema prisma/schema.prisma \
--       --exit-code
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "news_article_translations" ADD COLUMN "focusKeyword" TEXT;
