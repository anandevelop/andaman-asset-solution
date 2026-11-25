-- Careers: the HR role, open positions, and job applications with their
-- privately stored files and internal notes.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HR';

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'INTERVIEW', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "job_positions" (
    "id" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'full_time',
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_position_translations" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_position_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "positionId" TEXT,
    "positionTitle" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "education" TEXT NOT NULL,
    "expectedSalary" INTEGER NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'NEW',
    "locale" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "viewedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_application_files" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_application_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_application_notes" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_positions_isOpen_sortOrder_idx" ON "job_positions"("isOpen", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "job_position_translations_positionId_locale_key" ON "job_position_translations"("positionId", "locale");

-- CreateIndex
CREATE INDEX "job_applications_status_createdAt_idx" ON "job_applications"("status", "createdAt");

-- CreateIndex
CREATE INDEX "job_applications_purgeAfter_idx" ON "job_applications"("purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "job_application_files_key_key" ON "job_application_files"("key");

-- CreateIndex
CREATE INDEX "job_application_files_applicationId_idx" ON "job_application_files"("applicationId");

-- CreateIndex
CREATE INDEX "job_application_notes_applicationId_createdAt_idx" ON "job_application_notes"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "job_position_translations" ADD CONSTRAINT "job_position_translations_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "job_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "job_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application_files" ADD CONSTRAINT "job_application_files_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application_notes" ADD CONSTRAINT "job_application_notes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
