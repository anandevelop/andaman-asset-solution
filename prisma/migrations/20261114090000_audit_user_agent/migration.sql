-- The browser an audit entry was made from, beside the address it came from.
ALTER TABLE "audit_logs" ADD COLUMN "userAgent" TEXT;
