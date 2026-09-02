-- Failed sign-ins and the address a request came from.
--
-- Both columns are additive and both are nullable, so every existing row
-- stays valid and the migration needs no backfill. An audit table that had
-- to be rewritten to learn a new kind of entry would be a bad audit table.

-- Where the request came from. Null for an entry written outside a request,
-- and for every row that predates this column.
ALTER TABLE "audit_logs" ADD COLUMN "ipAddress" TEXT;

-- A failed sign-in can name an address that belongs to no account, and an
-- address with no account has no role. Dropping NOT NULL rather than
-- inventing a placeholder: a role on a person who does not exist would read
-- as a permission level somebody actually held.
ALTER TABLE "audit_logs" ALTER COLUMN "actorRole" DROP NOT NULL;
