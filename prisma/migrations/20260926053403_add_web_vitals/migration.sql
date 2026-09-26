-- CreateEnum
CREATE TYPE "VitalMetric" AS ENUM ('LCP', 'INP', 'CLS', 'TTFB');

-- CreateTable
CREATE TABLE "web_vitals" (
    "id" TEXT NOT NULL,
    "metric" "VitalMetric" NOT NULL,
    "value" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "commitSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_daily_rollups" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "metric" "VitalMetric" NOT NULL,
    "path" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "p75" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,

    CONSTRAINT "vital_daily_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_vitals_createdAt_idx" ON "web_vitals"("createdAt");

-- CreateIndex
CREATE INDEX "web_vitals_metric_path_createdAt_idx" ON "web_vitals"("metric", "path", "createdAt");

-- CreateIndex
CREATE INDEX "vital_daily_rollups_day_idx" ON "vital_daily_rollups"("day");

-- CreateIndex
CREATE UNIQUE INDEX "vital_daily_rollups_day_metric_path_device_key" ON "vital_daily_rollups"("day", "metric", "path", "device");
