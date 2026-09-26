-- CreateTable
CREATE TABLE "seo_url_states" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "auditScore" INTEGER NOT NULL,
    "checkedWeight" INTEGER NOT NULL DEFAULT 0,
    "failedRules" JSONB NOT NULL,
    "waivedRules" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_url_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_audit_runs" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "urlCount" INTEGER NOT NULL,
    "avgScore" INTEGER NOT NULL,
    "passAllCount" INTEGER NOT NULL,
    "failCountByRule" JSONB NOT NULL,

    CONSTRAINT "seo_audit_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_rule_waivers" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_rule_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seo_url_states_url_key" ON "seo_url_states"("url");

-- CreateIndex
CREATE INDEX "seo_url_states_auditScore_idx" ON "seo_url_states"("auditScore");

-- CreateIndex
CREATE INDEX "seo_url_states_checkedAt_idx" ON "seo_url_states"("checkedAt");

-- CreateIndex
CREATE INDEX "seo_audit_runs_runAt_idx" ON "seo_audit_runs"("runAt");

-- CreateIndex
CREATE INDEX "seo_rule_waivers_url_idx" ON "seo_rule_waivers"("url");

-- CreateIndex
CREATE UNIQUE INDEX "seo_rule_waivers_url_ruleKey_key" ON "seo_rule_waivers"("url", "ruleKey");

-- AddForeignKey
ALTER TABLE "seo_rule_waivers" ADD CONSTRAINT "seo_rule_waivers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
