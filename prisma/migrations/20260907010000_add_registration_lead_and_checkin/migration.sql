-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "locale" TEXT;

-- CreateIndex
-- Safe on existing rows: every leadId starts NULL, and Postgres treats
-- NULLs as distinct in a unique index, so no two existing rows collide.
CREATE UNIQUE INDEX "event_registrations_leadId_key" ON "event_registrations"("leadId");

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
