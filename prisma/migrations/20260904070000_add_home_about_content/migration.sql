-- ─────────────────────────────────────────────────────────────────────────
-- Home & About marketing content, moved out of messages/*.json and
-- component-hardcoded constants into the database — see:
--   - CompanyProfile: storyImageUrl/statTeamMembers/statClientFeedback/
--     statAwards/statProjectsComplete, and CompanyProfileTranslation:
--     storyEyebrow/storyTitle
--   - HomeGalleryPhoto ("Who we are" strip)
--   - SectionIcon, WhyUsPoint/WhyUsPointTranslation,
--     MissionPrinciple/MissionPrincipleTranslation
--   - CorporateService/CorporateServiceTranslation
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
-- Additive except for one thing: four new NOT NULL columns on
-- "company_profile" and two new NOT NULL columns on
-- "company_profile_translations", both given a DEFAULT so the ADD COLUMN
-- itself cannot fail against the one existing row. The DEFAULTs on
-- "company_profile" are today's hardcoded values (see each column's own
-- comment in schema.prisma) — chosen deliberately so this migration is a
-- visual no-op for every visitor. The UPDATE at the bottom backfills real
-- en/th copy into "company_profile_translations", the same one-time-backfill
-- approach prisma/migrations/20260820010000_add_i18n_translation_tables used
-- for aboutUs; zh/ru rows (if they exist yet) are left at the "" default,
-- which the page's existing `?? t(...)` fallback already handles the same
-- way it does for a locale aboutUs hasn't been filled in for either.
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable: CompanyProfile
ALTER TABLE "company_profile"
    ADD COLUMN "storyImageUrl" TEXT NOT NULL DEFAULT '/gallery/residence-prime/exterior-facade.webp',
    ADD COLUMN "statTeamMembers" TEXT NOT NULL DEFAULT '300+',
    ADD COLUMN "statClientFeedback" TEXT NOT NULL DEFAULT '1,000+',
    ADD COLUMN "statAwards" TEXT NOT NULL DEFAULT '10+',
    ADD COLUMN "statProjectsComplete" TEXT NOT NULL DEFAULT '30+';

-- AlterTable: CompanyProfileTranslation
ALTER TABLE "company_profile_translations"
    ADD COLUMN "storyEyebrow" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "storyTitle" TEXT NOT NULL DEFAULT '';

-- Backfill: today's messages/en.json / messages/th.json about.story.* copy,
-- into whichever en/th rows already exist (created by the original i18n
-- backfill migration). A no-op if neither locale has a row yet.
UPDATE "company_profile_translations"
SET "storyEyebrow" = 'Our Story', "storyTitle" = 'Built by people who live here'
WHERE "locale" = 'en';

UPDATE "company_profile_translations"
SET "storyEyebrow" = 'จุดเริ่มต้น', "storyTitle" = 'สร้างโดยคนที่อยู่ที่นี่จริง'
WHERE "locale" = 'th';

-- CreateTable: HomeGalleryPhoto
CREATE TABLE "home_gallery_photos" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_gallery_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "home_gallery_photos_imageUrl_key" ON "home_gallery_photos"("imageUrl");
CREATE INDEX "home_gallery_photos_isActive_sortOrder_idx" ON "home_gallery_photos"("isActive", "sortOrder");

-- CreateEnum: SectionIcon
CREATE TYPE "SectionIcon" AS ENUM ('MOUNTAIN', 'SHIELD_CHECK', 'HARD_HAT', 'HAND_HEART', 'EYE', 'HEART_HANDSHAKE');

-- CreateTable: WhyUsPoint
CREATE TABLE "why_us_points" (
    "id" TEXT NOT NULL,
    "icon" "SectionIcon" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "why_us_points_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "why_us_points_isActive_sortOrder_idx" ON "why_us_points"("isActive", "sortOrder");

-- CreateTable: WhyUsPointTranslation
CREATE TABLE "why_us_point_translations" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "why_us_point_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "why_us_point_translations_pointId_locale_key" ON "why_us_point_translations"("pointId", "locale");

ALTER TABLE "why_us_point_translations"
    ADD CONSTRAINT "why_us_point_translations_pointId_fkey"
    FOREIGN KEY ("pointId") REFERENCES "why_us_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: MissionPrinciple
CREATE TABLE "mission_principles" (
    "id" TEXT NOT NULL,
    "icon" "SectionIcon" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_principles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mission_principles_isActive_sortOrder_idx" ON "mission_principles"("isActive", "sortOrder");

-- CreateTable: MissionPrincipleTranslation
CREATE TABLE "mission_principle_translations" (
    "id" TEXT NOT NULL,
    "principleId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_principle_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mission_principle_translations_principleId_locale_key" ON "mission_principle_translations"("principleId", "locale");

ALTER TABLE "mission_principle_translations"
    ADD CONSTRAINT "mission_principle_translations_principleId_fkey"
    FOREIGN KEY ("principleId") REFERENCES "mission_principles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: CorporateService
CREATE TABLE "corporate_services" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "corporate_services_isActive_sortOrder_idx" ON "corporate_services"("isActive", "sortOrder");

-- CreateTable: CorporateServiceTranslation
CREATE TABLE "corporate_service_translations" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_service_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "corporate_service_translations_serviceId_locale_key" ON "corporate_service_translations"("serviceId", "locale");

ALTER TABLE "corporate_service_translations"
    ADD CONSTRAINT "corporate_service_translations_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "corporate_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
