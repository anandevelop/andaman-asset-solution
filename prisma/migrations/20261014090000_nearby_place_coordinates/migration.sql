-- An optional pin per nearby place, for the project map's route (lib/map-places.ts nearbyTarget).
-- AlterTable
ALTER TABLE "nearby_places" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;
