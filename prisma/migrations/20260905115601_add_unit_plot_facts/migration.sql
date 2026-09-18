-- AlterTable
ALTER TABLE "project_units" ADD COLUMN     "facing" TEXT,
ADD COLUMN     "phase" INTEGER,
ADD COLUMN     "releasedForSale" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "viewLabel" TEXT;
