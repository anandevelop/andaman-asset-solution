-- Per-project "nearby places" lists (lib/nearby.ts). projectId NULL is the shared list.

-- CreateTable
CREATE TABLE "nearby_categories" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "labelEn" TEXT NOT NULL,
    "labelTh" TEXT NOT NULL DEFAULT '',
    "labelZh" TEXT NOT NULL DEFAULT '',
    "labelRu" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nearby_places" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distanceKm" DECIMAL(6,2) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nearby_categories_projectId_sortOrder_idx" ON "nearby_categories"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "nearby_places_categoryId_sortOrder_idx" ON "nearby_places"("categoryId", "sortOrder");

-- AddForeignKey
ALTER TABLE "nearby_categories" ADD CONSTRAINT "nearby_categories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nearby_places" ADD CONSTRAINT "nearby_places_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "nearby_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

