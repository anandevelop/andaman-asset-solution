-- Nearby place names per language. Blank shows the English `name`, so no
-- backfill: every place reads as it did until someone translates it.
ALTER TABLE "nearby_places" ADD COLUMN "nameTh" TEXT NOT NULL DEFAULT '';
ALTER TABLE "nearby_places" ADD COLUMN "nameZh" TEXT NOT NULL DEFAULT '';
ALTER TABLE "nearby_places" ADD COLUMN "nameRu" TEXT NOT NULL DEFAULT '';
