-- AlterTable
ALTER TABLE "project_units" ADD COLUMN     "reservationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "reservedById" TEXT,
ADD COLUMN     "reservedByLeadId" TEXT;

-- CreateIndex
CREATE INDEX "project_units_reservedByLeadId_idx" ON "project_units"("reservedByLeadId");

-- AddForeignKey
ALTER TABLE "project_units" ADD CONSTRAINT "project_units_reservedByLeadId_fkey" FOREIGN KEY ("reservedByLeadId") REFERENCES "lead_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_units" ADD CONSTRAINT "project_units_reservedById_fkey" FOREIGN KEY ("reservedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
