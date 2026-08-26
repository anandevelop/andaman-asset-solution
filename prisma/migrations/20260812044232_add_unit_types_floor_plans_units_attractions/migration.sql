-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "masterPlanImageUrl" TEXT,
ADD COLUMN     "priceToTHB" DECIMAL(14,2),
ADD COLUMN     "projectArea" TEXT;

-- CreateTable
CREATE TABLE "project_unit_types" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionTh" TEXT,
    "livingAreaSqm" DECIMAL(8,2),
    "landAreaSqm" DECIMAL(8,2),
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "restrooms" INTEGER,
    "totalUnits" INTEGER,
    "priceFromTHB" DECIMAL(14,2),
    "priceToTHB" DECIMAL(14,2),
    "coverImageUrl" TEXT,
    "gallery" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plans" (
    "id" TEXT NOT NULL,
    "unitTypeId" TEXT NOT NULL,
    "floorName" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_units" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitTypeId" TEXT,
    "unitNumber" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "mapPolygon" TEXT,
    "landAreaSqm" DECIMAL(8,2),
    "priceTHB" DECIMAL(14,2),
    "adminNotes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_attractions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTh" TEXT,
    "distanceKm" DECIMAL(6,2),
    "travelTimeMin" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_attractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_unit_types_projectId_sortOrder_idx" ON "project_unit_types"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "floor_plans_unitTypeId_sortOrder_idx" ON "floor_plans"("unitTypeId", "sortOrder");

-- CreateIndex
CREATE INDEX "project_units_projectId_status_idx" ON "project_units"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_units_projectId_unitNumber_key" ON "project_units"("projectId", "unitNumber");

-- CreateIndex
CREATE INDEX "project_attractions_projectId_category_sortOrder_idx" ON "project_attractions"("projectId", "category", "sortOrder");

-- AddForeignKey
ALTER TABLE "project_unit_types" ADD CONSTRAINT "project_unit_types_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "project_unit_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_units" ADD CONSTRAINT "project_units_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_units" ADD CONSTRAINT "project_units_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "project_unit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_attractions" ADD CONSTRAINT "project_attractions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
