-- CreateTable
CREATE TABLE "crawl_hits" (
    "id" TEXT NOT NULL,
    "bot" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "notFound" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "crawl_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crawl_hits_hour_idx" ON "crawl_hits"("hour");

-- CreateIndex
CREATE INDEX "crawl_hits_path_idx" ON "crawl_hits"("path");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_hits_bot_path_hour_notFound_key" ON "crawl_hits"("bot", "path", "hour", "notFound");
