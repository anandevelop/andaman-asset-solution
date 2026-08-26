/**
 * scripts/create-admin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Bootstrap or reset an admin account. Without this there is no way to sign
 * in to a fresh database — the credentials provider has nothing to match.
 *
 *   npm run admin:create -- --email you@example.com --name "Your Name" \
 *                           --password "…" --role SUPER_ADMIN
 *
 * Falls back to ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars, and
 * generates a random password when none is supplied (printed once).
 * Re-running against an existing email updates that user in place.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { randomBytes } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(`--${flag}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function isRole(value: string): value is Role {
  return (Object.values(Role) as string[]).includes(value);
}

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  const name = arg("name") ?? process.env.ADMIN_NAME ?? "Administrator";
  const roleInput = arg("role") ?? process.env.ADMIN_ROLE ?? Role.SUPER_ADMIN;

  if (!email) {
    console.error(
      "❌ Missing email.\n" +
        '   Usage: npm run admin:create -- --email you@example.com --name "Your Name"',
    );
    process.exit(1);
  }

  if (!isRole(roleInput)) {
    console.error(`❌ Unknown role "${roleInput}". Expected one of: ${Object.values(Role).join(", ")}`);
    process.exit(1);
  }

  // A generated password is safer than a documented default that survives
  // into production because nobody remembered to change it.
  const generated = !arg("password") && !process.env.ADMIN_PASSWORD;
  const password = arg("password") ?? process.env.ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");

  if (password.length < 10) {
    console.error("❌ Password must be at least 10 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: roleInput, passwordHash, isActive: true },
    create: { email, name, role: roleInput, passwordHash, isActive: true },
  });

  console.log(`\n✓ Admin ready — ${user.email} (${user.role})`);
  if (generated) {
    console.log(`  Generated password: ${password}`);
    console.log("  Store it now; it is not recoverable from the database.\n");
  }
}

main()
  .catch((error) => {
    console.error("❌ Failed to create admin:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
