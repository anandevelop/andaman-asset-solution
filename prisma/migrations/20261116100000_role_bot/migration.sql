-- A role for an account a bot signs in with: an administrator's reach
-- without customers, co-agents or user accounts (lib/permissions.ts).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'BOT';
