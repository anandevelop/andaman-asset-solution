-- Switch for the 3D site plan view on the public project page (lib/site-plan-3d.ts).
-- AlterTable
ALTER TABLE "projects" ADD COLUMN "sitePlan3dEnabled" BOOLEAN NOT NULL DEFAULT true;
