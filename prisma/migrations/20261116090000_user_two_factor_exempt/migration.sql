-- An account a super admin has excused from the second factor (a bot that
-- signs in unattended). Off for everybody until somebody switches it on.
ALTER TABLE "users" ADD COLUMN "twoFactorExempt" BOOLEAN NOT NULL DEFAULT false;
