-- Suspected spam / test enquiries held for review, and blocked senders.
CREATE TABLE "suspect_leads" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "projectId" TEXT,
    "reasons" TEXT[],
    "input" JSONB NOT NULL,
    "notice" JSONB NOT NULL,

    CONSTRAINT "suspect_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suspect_leads_createdAt_idx" ON "suspect_leads"("createdAt");

CREATE TABLE "lead_blocks" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "lead_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_blocks_kind_value_key" ON "lead_blocks"("kind", "value");
