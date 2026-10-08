-- Admin overrides for the public site's message copy (lib/site-copy-core.ts).

-- CreateTable
CREATE TABLE "site_copy" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_copy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_copy_locale_key_key" ON "site_copy"("locale", "key");
