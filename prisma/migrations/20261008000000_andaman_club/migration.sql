-- ANDAMAN CLUB: residents, cards, partners, co-agents.
-- Hand-written to match prisma/schema.prisma (the schema engine was not
-- available where this was authored). Before deploying, check it with:
--   npx prisma migrate diff --from-migrations prisma/migrations \
--     --to-schema prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL"
-- which must print an empty migration.

-- AlterEnum
ALTER TYPE "UnitStatus" ADD VALUE 'TRANSFERRED';

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'AGENT';

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('NONE', 'PRINTED', 'HANDED');

-- CreateEnum
CREATE TYPE "OverrideRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "CardEventKind" AS ENUM ('SCAN', 'SCAN_REVOKED', 'OTP_SENT', 'OTP_OK', 'OTP_FAIL', 'OTP_LOCK', 'TRUSTED_LOGIN', 'CODE_LOGIN', 'REISSUE', 'SIGN_OUT_ALL', 'SIGN_OUT_DEVICE', 'QR_DOWNLOAD', 'EMAIL_CHANGED', 'PHONE_REVEALED', 'MEMBER_ADDED', 'MEMBER_REMOVED', 'CARD_PRINTED', 'CARD_HANDED', 'RESALE');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "cardCode" VARCHAR(8);

-- AlterTable
ALTER TABLE "sales_people" ADD COLUMN     "agentLinkEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refSlug" TEXT;

-- AlterTable
ALTER TABLE "lead_inquiries" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "agentLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "residents" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "nationality" VARCHAR(2) NOT NULL DEFAULT 'TH',
    "transferDate" TIMESTAMP(3) NOT NULL,
    "houseCode" TEXT NOT NULL,
    "purpose" TEXT,
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_members" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_ownerships" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "nationality" VARCHAR(2) NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_cards" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "status" "CardStatus" NOT NULL DEFAULT 'NONE',
    "printedAt" TIMESTAMP(3),
    "handedAt" TIMESTAMP(3),
    "handedTo" TEXT,
    "handoverMethod" TEXT,
    "handedBy" TEXT,

    CONSTRAINT "resident_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_devices" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "memberId" TEXT,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_otps" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_events" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "kind" "CardEventKind" NOT NULL,
    "actor" TEXT NOT NULL,
    "device" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "area" TEXT,
    "discountPct" INTEGER,
    "discountNote" TEXT,
    "phones" TEXT[],
    "contactName" TEXT,
    "emails" TEXT[],
    "website" TEXT,
    "coverImage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_translations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "discountNote" TEXT,

    CONSTRAINT "partner_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_projects" (
    "partnerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "partner_projects_pkey" PRIMARY KEY ("partnerId","projectId")
);

-- CreateTable
CREATE TABLE "partner_unit_overrides" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "discountPct" INTEGER,
    "updatedByName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_unit_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_override_requests" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fromHidden" BOOLEAN NOT NULL,
    "fromPct" INTEGER,
    "toHidden" BOOLEAN NOT NULL,
    "toPct" INTEGER,
    "status" "OverrideRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_override_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "salesPersonId" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "selfRegistered" BOOLEAN NOT NULL DEFAULT false,
    "noticeVersion" TEXT,
    "noticeAt" TIMESTAMP(3),
    "formLocale" VARCHAR(5),
    "newsConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_cardCode_key" ON "projects"("cardCode");

-- CreateIndex
CREATE UNIQUE INDEX "sales_people_refSlug_key" ON "sales_people"("refSlug");

-- CreateIndex
CREATE UNIQUE INDEX "residents_unitId_key" ON "residents"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "residents_houseCode_key" ON "residents"("houseCode");

-- CreateIndex
CREATE UNIQUE INDEX "resident_members_residentId_email_key" ON "resident_members"("residentId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "resident_cards_token_key" ON "resident_cards"("token");

-- CreateIndex
CREATE INDEX "resident_cards_residentId_revokedAt_idx" ON "resident_cards"("residentId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_tokenHash_key" ON "trusted_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "trusted_devices_residentId_idx" ON "trusted_devices"("residentId");

-- CreateIndex
CREATE INDEX "resident_otps_residentId_createdAt_idx" ON "resident_otps"("residentId", "createdAt");

-- CreateIndex
CREATE INDEX "card_events_residentId_createdAt_idx" ON "card_events"("residentId", "createdAt");

-- CreateIndex
CREATE INDEX "partners_isActive_category_idx" ON "partners"("isActive", "category");

-- CreateIndex
CREATE UNIQUE INDEX "partner_translations_partnerId_locale_key" ON "partner_translations"("partnerId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "partner_unit_overrides_partnerId_unitId_key" ON "partner_unit_overrides"("partnerId", "unitId");

-- CreateIndex
CREATE INDEX "partner_override_requests_status_createdAt_idx" ON "partner_override_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "partner_override_requests_unitId_partnerId_idx" ON "partner_override_requests"("unitId", "partnerId");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- AddForeignKey
ALTER TABLE "lead_inquiries" ADD CONSTRAINT "lead_inquiries_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "project_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_members" ADD CONSTRAINT "resident_members_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_ownerships" ADD CONSTRAINT "resident_ownerships_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_cards" ADD CONSTRAINT "resident_cards_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_otps" ADD CONSTRAINT "resident_otps_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_events" ADD CONSTRAINT "card_events_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_translations" ADD CONSTRAINT "partner_translations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_projects" ADD CONSTRAINT "partner_projects_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_projects" ADD CONSTRAINT "partner_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_unit_overrides" ADD CONSTRAINT "partner_unit_overrides_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_unit_overrides" ADD CONSTRAINT "partner_unit_overrides_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "project_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_override_requests" ADD CONSTRAINT "partner_override_requests_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_override_requests" ADD CONSTRAINT "partner_override_requests_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "project_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "sales_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Card codes for the three existing projects (slug match; adjust if slugs differ).
UPDATE "projects" SET "cardCode" = 'rp' WHERE "slug" ILIKE '%residence-prime%';
UPDATE "projects" SET "cardCode" = 'tv' WHERE "slug" ILIKE '%trinity%';
UPDATE "projects" SET "cardCode" = 'vc' WHERE "slug" ILIKE '%victory%';
