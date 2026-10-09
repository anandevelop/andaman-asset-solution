-- Remove ANDAMAN CLUB: residents, cards, OTP, trusted devices, partners and
-- per-house benefits (added by 20261008000000_andaman_club). Everything
-- stored in these tables is deleted. Back the database up first.
--
-- Kept: co-agents (agents table, sales_people.refSlug / agentLinkEnabled,
-- lead_inquiries.agentId / agentLinkedAt, enum AgentStatus) — the agent list
-- and /agent/register stay. Also kept: UnitStatus 'TRANSFERRED' and
-- LeadSource 'AGENT' — PostgreSQL cannot drop an enum value without
-- rebuilding the type, and units or leads may already carry them.

-- DropTable (children first)
DROP TABLE IF EXISTS "card_events";
DROP TABLE IF EXISTS "resident_otps";
DROP TABLE IF EXISTS "trusted_devices";
DROP TABLE IF EXISTS "resident_cards";
DROP TABLE IF EXISTS "resident_ownerships";
DROP TABLE IF EXISTS "resident_members";
DROP TABLE IF EXISTS "residents";
DROP TABLE IF EXISTS "partner_override_requests";
DROP TABLE IF EXISTS "partner_unit_overrides";
DROP TABLE IF EXISTS "partner_projects";
DROP TABLE IF EXISTS "partner_translations";
DROP TABLE IF EXISTS "partners";

-- DropIndex
DROP INDEX IF EXISTS "projects_cardCode_key";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN IF EXISTS "cardCode";

-- DropEnum
DROP TYPE IF EXISTS "CardEventKind";
DROP TYPE IF EXISTS "OverrideRequestStatus";
DROP TYPE IF EXISTS "CardStatus";
