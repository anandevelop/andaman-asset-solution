-- ─────────────────────────────────────────────────────────────────────────
-- Project.virtualTourUrl — an external 360° walkthrough link (Matterport,
-- Kuula, a YouTube 360 video), shown as a hero CTA on the public project
-- page when set. Additive and nullable: existing rows simply don't show
-- the button until an admin fills it in.
--
-- Verify against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema prisma/schema.prisma \
--       --exit-code
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "projects" ADD COLUMN "virtualTourUrl" TEXT;
