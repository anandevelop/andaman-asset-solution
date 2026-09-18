-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "project_progress" ADD COLUMN     "percentComplete" INTEGER;

-- CreateTable
CREATE TABLE "project_phases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "status" "PhaseStatus" NOT NULL DEFAULT 'PLANNED',
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "milestoneDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_progress_translations" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_progress_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_phases_projectId_sortOrder_idx" ON "project_phases"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "project_progress_translations_progressId_locale_key" ON "project_progress_translations"("progressId", "locale");

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_progress_translations" ADD CONSTRAINT "project_progress_translations_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "project_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
