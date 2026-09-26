-- CreateEnum
CREATE TYPE "SeoAlertKind" AS ENUM ('INDEX_DROP', 'NOT_FOUND_SPIKE', 'VITALS_REGRESSION', 'CLICKS_DROP', 'CRON_FAILED');

-- CreateTable
CREATE TABLE "report_notes" (
    "id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "audience" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_sends" (
    "id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "audience" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "report_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_alert_rules" (
    "kind" "SeoAlertKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_alert_rules_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "seo_alerts" (
    "id" TEXT NOT NULL,
    "kind" "SeoAlertKind" NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_notes_period_idx" ON "report_notes"("period");

-- CreateIndex
CREATE UNIQUE INDEX "report_notes_period_audience_locale_key" ON "report_notes"("period", "audience", "locale");

-- CreateIndex
CREATE INDEX "report_sends_sentAt_idx" ON "report_sends"("sentAt");

-- CreateIndex
CREATE INDEX "seo_alerts_kind_createdAt_idx" ON "seo_alerts"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "seo_alerts_createdAt_idx" ON "seo_alerts"("createdAt");

-- AddForeignKey
ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
