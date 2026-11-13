-- The site's own error log, alerted to LINE.
CREATE TABLE "system_errors" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAlertAt" TIMESTAMP(3),

    CONSTRAINT "system_errors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_errors_fingerprint_key" ON "system_errors"("fingerprint");
CREATE INDEX "system_errors_lastSeenAt_idx" ON "system_errors"("lastSeenAt");
