-- The location line per language. Null shows Project.location, so no
-- backfill.
ALTER TABLE "project_translations" ADD COLUMN "location" TEXT;
