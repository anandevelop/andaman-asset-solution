-- CreateTable
CREATE TABLE "seo_query_stats" (
    "date" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "seo_query_stats_pkey" PRIMARY KEY ("date","query","page","device")
);

-- CreateIndex
CREATE INDEX "seo_query_stats_date_idx" ON "seo_query_stats"("date");

-- CreateIndex
CREATE INDEX "seo_query_stats_query_idx" ON "seo_query_stats"("query");

-- CreateIndex
CREATE INDEX "seo_query_stats_page_idx" ON "seo_query_stats"("page");
