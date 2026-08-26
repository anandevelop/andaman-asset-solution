-- ─────────────────────────────────────────────────────────────────────────
-- i18n architecture migration: column-per-language → Translation tables.
--
-- The site is moving from 2 locales (th/en) to 4 (en/th/zh/ru — see
-- i18n.ts). A fifth nameEn/nameTh-style column pair per model does not
-- scale to that, so every model with bilingual content gets a child
-- "Translation" table instead: one row per (parent, locale), read through
-- lib/get-translation.ts's locale → "en" → "th" fallback chain.
--
-- This is an EXPAND migration, not a breaking rename. The deprecated
-- column pairs (nameEn/nameTh, titleEn/titleTh, ...) are left in place —
-- see the `@deprecated` doc comments added alongside them in
-- schema.prisma — and every consumer keeps reading them until it is
-- individually switched over to getTranslation() in a later change. A
-- follow-up CONTRACT migration drops the deprecated columns once nothing
-- reads them anymore; this migration does not do that.
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
-- Three parts, repeated once per translated model (9 total — every model
-- named in the task spec except CompanyMilestone, which does not exist in
-- this schema; the About page's milestones are a hardcoded array, out of
-- scope for this pass):
--
--   1. CreateTable — one child table per model, FK'd to its parent,
--      @@unique(parentId, locale) so an upsert from the admin's future
--      language-dropdown form has a natural conflict target.
--   2. CreateIndex / AddForeignKey — same as any other child table here.
--   3. Backfill — one row per existing record for "en" (from the *En
--      column) and, where the *Th column has a value, one more for "th".
--      No "zh" or "th" is fabricated by translating anything — the task
--      is explicit that every locale is filled in by hand by an admin,
--      never auto-translated. A model whose *Th column is nullable and
--      currently null (e.g. NearbyAttractionItem.nameTh on an item an
--      admin never translated) gets no "th" row at all: getTranslation()'s
--      fallback chain already reaches "en" for that case today via
--      pickLocale() (see lib/locale.ts), and reaches it the same way via
--      an absent Translation row once callers switch over — inserting a
--      "th" row that just duplicates the English text would make an
--      untranslated field look translated.
--
-- gen_random_uuid() is built into Postgres core as of v13 (no pgcrypto
-- extension needed) — used here only because this is a one-time raw-SQL
-- INSERT; every row created afterwards goes through Prisma Client, which
-- uses the `cuid()` default instead.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. ProjectTranslation ───────────────────────────────────────────────

-- CreateTable
CREATE TABLE "project_translations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "conceptDesign" TEXT,
    "aboutThisProject" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_translations_projectId_locale_key" ON "project_translations"("projectId", "locale");

-- AddForeignKey
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: "en" row for every project (nameEn is required, so this is unconditional).
INSERT INTO "project_translations"
    ("id", "projectId", "locale", "name", "tagline", "description", "conceptDesign", "aboutThisProject", "metaTitle", "metaDescription", "updatedAt")
SELECT
    gen_random_uuid()::text, p."id", 'en',
    p."nameEn", p."taglineEn", p."descriptionEn", p."conceptDesignEn", p."aboutThisProjectEn", p."metaTitleEn", p."metaDescriptionEn",
    CURRENT_TIMESTAMP
FROM "projects" p
WHERE p."deletedAt" IS NULL
ON CONFLICT ("projectId", "locale") DO NOTHING;

-- Backfill: "th" row for every project (nameTh is required too).
INSERT INTO "project_translations"
    ("id", "projectId", "locale", "name", "tagline", "description", "conceptDesign", "aboutThisProject", "metaTitle", "metaDescription", "updatedAt")
SELECT
    gen_random_uuid()::text, p."id", 'th',
    p."nameTh", p."taglineTh", p."descriptionTh", p."conceptDesignTh", p."aboutThisProjectTh", p."metaTitleTh", p."metaDescriptionTh",
    CURRENT_TIMESTAMP
FROM "projects" p
WHERE p."deletedAt" IS NULL
ON CONFLICT ("projectId", "locale") DO NOTHING;

-- ── 2. UnitTypeTranslation ──────────────────────────────────────────────
-- Only `description` — ProjectUnitType.name is not a bilingual pair (see
-- its schema comment) and has no Translation counterpart.

-- CreateTable
CREATE TABLE "unit_type_translations" (
    "id" TEXT NOT NULL,
    "unitTypeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_type_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_type_translations_unitTypeId_locale_key" ON "unit_type_translations"("unitTypeId", "locale");

-- AddForeignKey
ALTER TABLE "unit_type_translations" ADD CONSTRAINT "unit_type_translations_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "project_unit_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: only where the source column actually has text — there is no
-- required field on this table to anchor an "always insert a row" rule on
-- (unlike ProjectTranslation.name), and an empty row carries no signal.
INSERT INTO "unit_type_translations" ("id", "unitTypeId", "locale", "description", "updatedAt")
SELECT gen_random_uuid()::text, ut."id", 'en', ut."descriptionEn", CURRENT_TIMESTAMP
FROM "project_unit_types" ut
WHERE ut."descriptionEn" IS NOT NULL
ON CONFLICT ("unitTypeId", "locale") DO NOTHING;

INSERT INTO "unit_type_translations" ("id", "unitTypeId", "locale", "description", "updatedAt")
SELECT gen_random_uuid()::text, ut."id", 'th', ut."descriptionTh", CURRENT_TIMESTAMP
FROM "project_unit_types" ut
WHERE ut."descriptionTh" IS NOT NULL
ON CONFLICT ("unitTypeId", "locale") DO NOTHING;

-- ── 3. ProjectFacilityTranslation ───────────────────────────────────────

-- CreateTable
CREATE TABLE "project_facility_translations" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_facility_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_facility_translations_facilityId_locale_key" ON "project_facility_translations"("facilityId", "locale");

-- AddForeignKey
ALTER TABLE "project_facility_translations" ADD CONSTRAINT "project_facility_translations_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "project_facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: nameEn/nameTh are both required, so both rows are unconditional.
INSERT INTO "project_facility_translations" ("id", "facilityId", "locale", "name", "updatedAt")
SELECT gen_random_uuid()::text, f."id", 'en', f."nameEn", CURRENT_TIMESTAMP
FROM "project_facilities" f
ON CONFLICT ("facilityId", "locale") DO NOTHING;

INSERT INTO "project_facility_translations" ("id", "facilityId", "locale", "name", "updatedAt")
SELECT gen_random_uuid()::text, f."id", 'th', f."nameTh", CURRENT_TIMESTAMP
FROM "project_facilities" f
ON CONFLICT ("facilityId", "locale") DO NOTHING;

-- ── 4. AwardTranslation ─────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "award_translations" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "award_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "award_translations_awardId_locale_key" ON "award_translations"("awardId", "locale");

-- AddForeignKey
ALTER TABLE "award_translations" ADD CONSTRAINT "award_translations_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "awards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: titleEn/titleTh are both required, so both rows are unconditional.
INSERT INTO "award_translations" ("id", "awardId", "locale", "title", "updatedAt")
SELECT gen_random_uuid()::text, a."id", 'en', a."titleEn", CURRENT_TIMESTAMP
FROM "awards" a
ON CONFLICT ("awardId", "locale") DO NOTHING;

INSERT INTO "award_translations" ("id", "awardId", "locale", "title", "updatedAt")
SELECT gen_random_uuid()::text, a."id", 'th', a."titleTh", CURRENT_TIMESTAMP
FROM "awards" a
ON CONFLICT ("awardId", "locale") DO NOTHING;

-- ── 5. SalesPersonTranslation ───────────────────────────────────────────

-- CreateTable
CREATE TABLE "sales_person_translations" (
    "id" TEXT NOT NULL,
    "salesPersonId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_person_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_person_translations_salesPersonId_locale_key" ON "sales_person_translations"("salesPersonId", "locale");

-- AddForeignKey
ALTER TABLE "sales_person_translations" ADD CONSTRAINT "sales_person_translations_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "sales_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: name + position are all required on both EN and TH today, so both rows are unconditional.
INSERT INTO "sales_person_translations" ("id", "salesPersonId", "locale", "name", "position", "updatedAt")
SELECT gen_random_uuid()::text, sp."id", 'en', sp."nameEn", sp."positionEn", CURRENT_TIMESTAMP
FROM "sales_people" sp
ON CONFLICT ("salesPersonId", "locale") DO NOTHING;

INSERT INTO "sales_person_translations" ("id", "salesPersonId", "locale", "name", "position", "updatedAt")
SELECT gen_random_uuid()::text, sp."id", 'th', sp."nameTh", sp."positionTh", CURRENT_TIMESTAMP
FROM "sales_people" sp
ON CONFLICT ("salesPersonId", "locale") DO NOTHING;

-- ── 6. NearbyAttractionCategoryTranslation ──────────────────────────────

-- CreateTable
CREATE TABLE "nearby_attraction_category_translations" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_attraction_category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nearby_attraction_category_translations_categoryId_locale_key" ON "nearby_attraction_category_translations"("categoryId", "locale");

-- AddForeignKey
ALTER TABLE "nearby_attraction_category_translations" ADD CONSTRAINT "nearby_attraction_category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "nearby_attraction_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: "en" unconditional (categoryNameEn required); "th" only where categoryNameTh is filled in.
INSERT INTO "nearby_attraction_category_translations" ("id", "categoryId", "locale", "categoryName", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'en', c."categoryNameEn", CURRENT_TIMESTAMP
FROM "nearby_attraction_categories" c
ON CONFLICT ("categoryId", "locale") DO NOTHING;

INSERT INTO "nearby_attraction_category_translations" ("id", "categoryId", "locale", "categoryName", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'th', c."categoryNameTh", CURRENT_TIMESTAMP
FROM "nearby_attraction_categories" c
WHERE c."categoryNameTh" IS NOT NULL
ON CONFLICT ("categoryId", "locale") DO NOTHING;

-- ── 7. NearbyAttractionItemTranslation ──────────────────────────────────

-- CreateTable
CREATE TABLE "nearby_attraction_item_translations" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_attraction_item_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nearby_attraction_item_translations_itemId_locale_key" ON "nearby_attraction_item_translations"("itemId", "locale");

-- AddForeignKey
ALTER TABLE "nearby_attraction_item_translations" ADD CONSTRAINT "nearby_attraction_item_translations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "nearby_attraction_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: "en" unconditional (nameEn required); "th" only where nameTh is filled in.
INSERT INTO "nearby_attraction_item_translations" ("id", "itemId", "locale", "name", "updatedAt")
SELECT gen_random_uuid()::text, i."id", 'en', i."nameEn", CURRENT_TIMESTAMP
FROM "nearby_attraction_items" i
ON CONFLICT ("itemId", "locale") DO NOTHING;

INSERT INTO "nearby_attraction_item_translations" ("id", "itemId", "locale", "name", "updatedAt")
SELECT gen_random_uuid()::text, i."id", 'th', i."nameTh", CURRENT_TIMESTAMP
FROM "nearby_attraction_items" i
WHERE i."nameTh" IS NOT NULL
ON CONFLICT ("itemId", "locale") DO NOTHING;

-- ── 8. CompanyProfileTranslation ────────────────────────────────────────
-- CompanyProfile is a singleton (id = 'default'), so this table only ever
-- has up to 4 rows total — one per locale — but it is still modelled as a
-- normal child relation, not columns on CompanyProfile, for the same
-- reason every table above is: a fifth locale later needs a new row, not
-- a new migration.

-- CreateTable
CREATE TABLE "company_profile_translations" (
    "id" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "aboutUs" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_profile_translations_companyProfileId_locale_key" ON "company_profile_translations"("companyProfileId", "locale");

-- AddForeignKey
ALTER TABLE "company_profile_translations" ADD CONSTRAINT "company_profile_translations_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: "en" unconditional (aboutUsEn required); "th" only where aboutUsTh is filled in.
INSERT INTO "company_profile_translations" ("id", "companyProfileId", "locale", "aboutUs", "updatedAt")
SELECT gen_random_uuid()::text, cp."id", 'en', cp."aboutUsEn", CURRENT_TIMESTAMP
FROM "company_profile" cp
ON CONFLICT ("companyProfileId", "locale") DO NOTHING;

INSERT INTO "company_profile_translations" ("id", "companyProfileId", "locale", "aboutUs", "updatedAt")
SELECT gen_random_uuid()::text, cp."id", 'th', cp."aboutUsTh", CURRENT_TIMESTAMP
FROM "company_profile" cp
WHERE cp."aboutUsTh" IS NOT NULL
ON CONFLICT ("companyProfileId", "locale") DO NOTHING;

-- ── 9. NewsArticleTranslation ───────────────────────────────────────────

-- CreateTable
CREATE TABLE "news_article_translations" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_article_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_article_translations_articleId_locale_key" ON "news_article_translations"("articleId", "locale");

-- AddForeignKey
ALTER TABLE "news_article_translations" ADD CONSTRAINT "news_article_translations_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: titleEn/titleTh and contentEn/contentTh are all required, so both rows are unconditional.
INSERT INTO "news_article_translations" ("id", "articleId", "locale", "title", "excerpt", "content", "metaTitle", "metaDescription", "updatedAt")
SELECT gen_random_uuid()::text, n."id", 'en', n."titleEn", n."excerptEn", n."contentEn", n."metaTitleEn", n."metaDescriptionEn", CURRENT_TIMESTAMP
FROM "news_articles" n
WHERE n."deletedAt" IS NULL
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "news_article_translations" ("id", "articleId", "locale", "title", "excerpt", "content", "metaTitle", "metaDescription", "updatedAt")
SELECT gen_random_uuid()::text, n."id", 'th', n."titleTh", n."excerptTh", n."contentTh", n."metaTitleTh", n."metaDescriptionTh", CURRENT_TIMESTAMP
FROM "news_articles" n
WHERE n."deletedAt" IS NULL
ON CONFLICT ("articleId", "locale") DO NOTHING;
