-- ─────────────────────────────────────────────────────────────────────────
-- SalesPerson: split name/position into nameEn/nameTh + positionEn/
-- positionTh, add phoneNumber (tel: link, separate from whatsappNumber)
-- and email (optional).
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
-- Data-preserving, in three steps per renamed/new required column:
--   1. RENAME (name → nameEn, position → positionEn) or ADD as nullable.
--   2. Backfill the new nullable column from the closest existing value —
--      nameTh/positionTh from the just-renamed English column, phoneNumber
--      from whatsappNumber. This is a temporary duplicate, not a real
--      translation or a confirmed separate phone line; an admin corrects
--      each one for real via /admin/sales-team once this ships. Skipped
--      entirely on a fresh database with zero existing rows — the UPDATEs
--      below are no-ops there.
--   3. SET NOT NULL now that every row has a value.
-- email has no equivalent existing column, so it is simply added nullable.
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable: name -> nameEn, position -> positionEn
ALTER TABLE "sales_people" RENAME COLUMN "name" TO "nameEn";
ALTER TABLE "sales_people" RENAME COLUMN "position" TO "positionEn";

-- AlterTable: add the new bilingual + contact columns, nullable for now
ALTER TABLE "sales_people" ADD COLUMN "nameTh" TEXT;
ALTER TABLE "sales_people" ADD COLUMN "positionTh" TEXT;
ALTER TABLE "sales_people" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "sales_people" ADD COLUMN "email" TEXT;

-- Backfill: temporary duplicate for existing rows only — see header.
UPDATE "sales_people" SET "nameTh" = "nameEn" WHERE "nameTh" IS NULL;
UPDATE "sales_people" SET "positionTh" = "positionEn" WHERE "positionTh" IS NULL;
UPDATE "sales_people" SET "phoneNumber" = "whatsappNumber" WHERE "phoneNumber" IS NULL;

-- Now that every row has a value, enforce NOT NULL to match the schema
-- (email stays nullable — see header).
ALTER TABLE "sales_people" ALTER COLUMN "nameTh" SET NOT NULL;
ALTER TABLE "sales_people" ALTER COLUMN "positionTh" SET NOT NULL;
ALTER TABLE "sales_people" ALTER COLUMN "phoneNumber" SET NOT NULL;
