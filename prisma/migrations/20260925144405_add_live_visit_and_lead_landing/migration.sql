-- AlterTable
ALTER TABLE "lead_inquiries" ADD COLUMN     "landingPath" TEXT,
ADD COLUMN     "landingReferrer" TEXT;

-- CreateTable
CREATE TABLE "live_visits" (
    "id" TEXT NOT NULL,
    "visitHash" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dwellMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "live_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_visits_visitHash_key" ON "live_visits"("visitHash");

-- CreateIndex
CREATE INDEX "live_visits_lastSeenAt_idx" ON "live_visits"("lastSeenAt");
