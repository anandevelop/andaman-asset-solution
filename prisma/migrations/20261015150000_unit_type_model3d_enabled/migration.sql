-- Show/hide the 3D house model per unit type (default: shown).
ALTER TABLE "project_unit_types" ADD COLUMN "model3dEnabled" BOOLEAN NOT NULL DEFAULT true;
