-- "Checked, still right" marks for translated site copy (SiteCopyReview).

-- CreateTable
CREATE TABLE "site_copy_review" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_copy_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_copy_review_locale_key_key" ON "site_copy_review"("locale", "key");
