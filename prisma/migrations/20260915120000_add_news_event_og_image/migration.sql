-- ─────────────────────────────────────────────────────────────────────────
-- NewsArticle.ogImageUrl / Event.ogImageUrl — the same manual social-share
-- image override Project.ogImageUrl already has, extended to the other two
-- content types whose opengraph-image.tsx route redraws a card from a
-- cover photo that does not always crop well at 1200×630. Additive and
-- nullable: existing rows fall back to coverImageUrl exactly as before.
--
-- Verify against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema prisma/schema.prisma \
--       --exit-code
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "news_articles" ADD COLUMN "ogImageUrl" TEXT;
ALTER TABLE "events" ADD COLUMN "ogImageUrl" TEXT;
