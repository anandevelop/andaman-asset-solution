-- CreateEnum
CREATE TYPE "PortraitRotation" AS ENUM ('CW', 'CCW');

-- AlterTable
ALTER TABLE "floor_plans" ADD COLUMN     "areaSqm" DECIMAL(8,2),
ADD COLUMN     "blueprintImageUrl" TEXT,
ADD COLUMN     "furnishedImageUrl" TEXT,
ADD COLUMN     "imageHeight" INTEGER,
ADD COLUMN     "imageWidth" INTEGER,
ADD COLUMN     "portraitRotation" "PortraitRotation" NOT NULL DEFAULT 'CW',
ADD COLUMN     "shortLabel" VARCHAR(3);

-- AlterTable
ALTER TABLE "project_unit_types" ADD COLUMN     "code" TEXT,
ADD COLUMN     "hasPrivateLift" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "floor_plan_rooms" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "xPercent" DOUBLE PRECISION NOT NULL,
    "yPercent" DOUBLE PRECISION NOT NULL,
    "areaSqm" DECIMAL(8,2),
    "photoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plan_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plan_room_translations" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "floor_plan_room_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floor_plan_rooms_floorPlanId_sortOrder_idx" ON "floor_plan_rooms"("floorPlanId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "floor_plan_room_translations_roomId_locale_key" ON "floor_plan_room_translations"("roomId", "locale");

-- AddForeignKey
ALTER TABLE "floor_plan_rooms" ADD CONSTRAINT "floor_plan_rooms_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_room_translations" ADD CONSTRAINT "floor_plan_room_translations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "floor_plan_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

