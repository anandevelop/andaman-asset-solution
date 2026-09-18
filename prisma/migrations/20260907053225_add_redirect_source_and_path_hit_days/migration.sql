-- CreateEnum
CREATE TYPE "RedirectSource" AS ENUM ('AUTO_SLUG', 'MANUAL');

-- CreateEnum
CREATE TYPE "PathHitKind" AS ENUM ('REDIRECT', 'NOT_FOUND');

-- AlterTable
ALTER TABLE "redirects" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" "RedirectSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "path_hit_days" (
    "id" TEXT NOT NULL,
    "kind" "PathHitKind" NOT NULL,
    "path" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "path_hit_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "path_hit_days_day_idx" ON "path_hit_days"("day");

-- CreateIndex
CREATE UNIQUE INDEX "path_hit_days_kind_path_day_key" ON "path_hit_days"("kind", "path", "day");

-- CreateIndex
CREATE INDEX "redirects_source_idx" ON "redirects"("source");
