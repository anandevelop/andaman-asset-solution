-- Add Project.googleMapsUrl: a plain link pasted from Google Maps' "Share"
-- button, used as the public project page's "Get Directions" button target.
-- Purely additive — nullable, no backfill needed.

ALTER TABLE "projects" ADD COLUMN "googleMapsUrl" TEXT;
