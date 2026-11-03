-- PageSpeed Insights results for the SEO centre's speed tab.
CREATE TABLE "pagespeed_runs" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "performance" INTEGER,
    "accessibility" INTEGER,
    "bestPractices" INTEGER,
    "seo" INTEGER,
    "fcpMs" INTEGER,
    "lcpMs" INTEGER,
    "tbtMs" INTEGER,
    "siMs" INTEGER,
    "ttfbMs" INTEGER,
    "cls" INTEGER,
    "pageBytes" INTEGER,
    "field" JSONB,
    "opportunities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagespeed_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pagespeed_runs_path_strategy_createdAt_idx" ON "pagespeed_runs"("path", "strategy", "createdAt");
CREATE INDEX "pagespeed_runs_createdAt_idx" ON "pagespeed_runs"("createdAt");
