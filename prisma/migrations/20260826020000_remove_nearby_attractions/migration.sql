-- ─────────────────────────────────────────────────────────────────────────
-- Remove the Nearby Attractions feature entirely — the 4 models added in
-- 20260812044232_add_unit_types_floor_plans_units_attractions plus their
-- FK back to projects.
--
-- Written by hand, like the migration that created these tables, because
-- this sandbox has no live Postgres to run `prisma migrate dev` against.
-- Verify against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema-datamodel prisma/schema.prisma \
--       --shadow-database-url "$SHADOW_DATABASE_URL" \
--       --exit-code
--
-- Why: the "shared default, project-overridable" design let a project
-- define its own categories that replaced the shared list entirely, but no
-- project ever did — all 3 launched projects rendered the identical shared
-- list. Worse, the admin screen for editing that shared list was silently
-- pointless: prisma/seed.ts deleted and recreated every
-- nearby_attraction_categories row with projectId IS NULL on every seed
-- run, so an edit made through the admin never survived a re-seed. Client
-- decided the ~790-line admin CRUD (its own top-level nav item, 4-language
-- translation tabs) wasn't worth keeping for a list that never actually
-- changed. The same data now lives in content/nearby-attractions.ts,
-- edited by a developer the rare time it needs to change.
--
-- Destructive: every row in these 4 tables is gone once this runs. There
-- is no soft-delete for any of them. In practice only the shared-default
-- rows (projectId IS NULL) were ever populated — see the seed.ts comment
-- above — so nothing meaningful is lost, but back up first if in doubt.
--
-- Drop order matters here (unlike a single-table drop): the translation
-- tables and items reference categories by FK, so they must go first.
-- DROP TABLE removes its own indexes and FK constraints automatically —
-- no separate DROP INDEX / DROP CONSTRAINT statements needed.
-- ─────────────────────────────────────────────────────────────────────────

-- DropTable
DROP TABLE "nearby_attraction_item_translations";

-- DropTable
DROP TABLE "nearby_attraction_category_translations";

-- DropTable
DROP TABLE "nearby_attraction_items";

-- DropTable
DROP TABLE "nearby_attraction_categories";
