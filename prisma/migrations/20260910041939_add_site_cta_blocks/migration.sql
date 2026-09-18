-- CreateEnum
CREATE TYPE "CtaLinkKind" AS ENUM ('PAGE', 'URL', 'WHATSAPP', 'PHONE', 'NONE');

-- CreateTable
CREATE TABLE "site_cta_blocks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "backgroundImageUrl" TEXT,
    "primaryKind" "CtaLinkKind" NOT NULL DEFAULT 'PAGE',
    "primaryHref" TEXT,
    "secondaryKind" "CtaLinkKind" NOT NULL DEFAULT 'WHATSAPP',
    "secondaryHref" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_cta_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_cta_block_translations" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "eyebrow" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "primaryLabel" TEXT,
    "secondaryLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_cta_block_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_cta_placements" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "blockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_cta_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_cta_blocks_isActive_idx" ON "site_cta_blocks"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "site_cta_block_translations_blockId_locale_key" ON "site_cta_block_translations"("blockId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "site_cta_placements_path_key" ON "site_cta_placements"("path");

-- CreateIndex
CREATE INDEX "site_cta_placements_blockId_idx" ON "site_cta_placements"("blockId");

-- AddForeignKey
ALTER TABLE "site_cta_block_translations" ADD CONSTRAINT "site_cta_block_translations_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "site_cta_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_cta_placements" ADD CONSTRAINT "site_cta_placements_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "site_cta_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
