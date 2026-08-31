-- ─────────────────────────────────────────────────────────────────────────
-- Two-factor authentication for the admin back-office.
--
-- Three nullable columns on "users" plus one new table. Purely additive:
-- every existing row keeps totpEnabledAt NULL, which reads as "2FA not set
-- up" everywhere in the code, so applying this migration changes nobody's
-- ability to sign in. The enrolment gate (lib/admin/guard.ts) is what
-- subsequently pushes ADMIN and SUPER_ADMIN accounts through setup.
--
-- "totpSecret" holds ciphertext, not the shared secret itself — AES-256-GCM
-- keyed off NEXTAUTH_SECRET (lib/totp.ts). A database dump on its own is
-- therefore not enough to mint valid codes.
--
-- Written by hand rather than generated — no network access to Prisma's
-- binary CDN in this sandbox (same note as every prior migration in this
-- repo). Verify against a real database with:
--
--     npx prisma migrate diff \
--       --from-migrations prisma/migrations \
--       --to-schema-datamodel prisma/schema.prisma \
--       --shadow-database-url "$SHADOW_DATABASE_URL" \
--       --exit-code
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER;

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_codes_userId_idx" ON "recovery_codes"("userId");

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
