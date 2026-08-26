-- ─────────────────────────────────────────────────────────────────────────
-- Add "agencyName" and "whatsapp" to event_registrations — the public RSVP
-- form was redesigned for agent-partner events (client-provided reference
-- design) and now collects an agent's agency/company name and an optional
-- WhatsApp number instead of a party size and free-text notes.
--
-- Written by hand, like every other migration in this repo, because this
-- sandbox has no live Postgres to run `prisma migrate dev` against. Verify
-- against the schema with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema-datamodel prisma/schema.prisma \
--       --shadow-database-url "$SHADOW_DATABASE_URL" \
--       --exit-code
--
-- Both columns are nullable at the database level even though the public
-- form requires "agencyName" going forward (Zod enforces that) — a plain
-- ADD COLUMN ... NOT NULL fails outright on a table that already has rows,
-- since Postgres has nothing to backfill existing registrations with.
-- Nullable-in-DB, required-in-form is the same tradeoff already used
-- elsewhere in this schema (e.g. Project.nameTh).
--
-- "partySize" and "notes" are NOT touched here — see their updated comments
-- in schema.prisma for why they stay (capacity math keeps working
-- unchanged, old rows keep their real values).
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "event_registrations"
  ADD COLUMN "agencyName" TEXT,
  ADD COLUMN "whatsapp" TEXT;
