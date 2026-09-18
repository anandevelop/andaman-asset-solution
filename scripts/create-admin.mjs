/**
 * scripts/create-admin.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Bootstrap the first admin account. Without this there is no way to sign
 * in to a fresh database — the credentials provider has nothing to match.
 *
 *   npm run admin:create -- --email you@example.com --name "Your Name"
 *
 * Plain JavaScript, not TypeScript, and that is the point. The production
 * image is `.next/standalone` only: no source tree, no devDependencies, no
 * npm, and therefore no tsx. docs/DEPLOYMENT.md used to tell operators to
 * run `node_modules/.bin/tsx scripts/create-admin.ts` inside that image,
 * which could never have worked — the binary and the script were both
 * absent. Creating the first admin is a first-deployment step, so the tool
 * has to run where the deployment is. This file and bcryptjs are copied
 * into the runner stage alongside prisma, for the same reason
 * `prisma migrate deploy` is runnable from there.
 *
 * Password handling, in order of preference:
 *   --password / ADMIN_PASSWORD   what you chose; never echoed back
 *   neither                       generated, printed once, never stored
 *
 * There is deliberately no default password anywhere in this repository. A
 * documented one survives every deploy and every README, and is the first
 * thing anyone tries against a site holding a customer database.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { randomBytes } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
// Prisma 7 has no built-in engine: every client needs a driver adapter.
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Matches lib/auth.ts and the admin user actions. */
const BCRYPT_ROUNDS = 12;

const MIN_PASSWORD_LENGTH = 10;

function arg(flag) {
  const index = process.argv.indexOf(`--${flag}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(`--${flag}`);
}

function isRole(value) {
  return Object.values(Role).includes(value);
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  const name = arg("name") ?? process.env.ADMIN_NAME ?? "Administrator";
  const roleInput = arg("role") ?? process.env.ADMIN_ROLE ?? Role.SUPER_ADMIN;
  const resetting = hasFlag("reset-password");

  if (!email) {
    fail(
      "Missing email.\n" +
        '   Usage: npm run admin:create -- --email you@example.com --name "Your Name"',
    );
  }

  if (!isRole(roleInput)) {
    fail(`Unknown role "${roleInput}". Expected one of: ${Object.values(Role).join(", ")}`);
  }

  const supplied = arg("password") ?? process.env.ADMIN_PASSWORD;
  const password = supplied ?? randomBytes(12).toString("base64url");

  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  /*
    Creating and resetting are separate operations, and the destructive one
    has to be asked for by name.

    This script used to upsert, so re-running it against an existing
    address silently rewrote that account's password, name, role and
    isActive. Two ways that goes wrong on a live site: a re-run during a
    deploy resets a working admin's password, and a typo'd or omitted
    --role quietly rewrites someone's permissions — the default here is
    SUPER_ADMIN, so an EDITOR could be promoted by a command that looks
    like it is only setting a password.
  */
  if (existing && !resetting) {
    fail(
      `${email} already exists (${existing.role}).\n` +
        "   This tool only creates the first account. To add colleagues use\n" +
        "   /admin/users, which keeps the audit trail. To recover a lost\n" +
        "   password, re-run with --reset-password.",
    );
  }

  if (!existing && resetting) {
    fail(`${email} does not exist, so there is no password to reset.`);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  if (existing) {
    /*
      Password only. Role, name and isActive are left exactly as they are —
      a recovery should not be able to change what an account is allowed to
      do, and an operator reaching for this under pressure should not have
      to think about what else it might touch.

      credentialsChangedAt ends every session issued before now, which is
      the point of a reset when the old password may be in someone else's
      hands. See lib/auth.ts.
    */
    await prisma.user.update({
      where: { email },
      data: { passwordHash, credentialsChangedAt: new Date() },
    });

    console.log(`\n✓ Password reset — ${email} (${existing.role})`);
    console.log("  Existing sessions for this account are now invalid.");
  } else {
    await prisma.user.create({
      data: { email, name, role: roleInput, passwordHash, isActive: true },
    });

    console.log(`\n✓ Admin created — ${email} (${roleInput})`);
  }

  if (supplied) {
    console.log("  Password: the one you supplied.\n");
  } else {
    console.log(`  Generated password: ${password}`);
    console.log("  Store it now; the database keeps only a bcrypt hash.\n");
  }

  /*
    lib/two-factor-policy.ts requires a second factor of every role, so the
    first sign-in lands on /admin/account/security and can go nowhere else
    until enrolment is finished. Said here because it is surprising to be
    handed working credentials and then blocked by a page you did not ask
    for.
  */
  console.log("  Next: sign in, enrol a second factor when prompted, then");
  console.log("  create a second SUPER_ADMIN at /admin/users.\n");
}

main()
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
