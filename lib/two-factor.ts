/**
 * lib/two-factor.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The database half of 2FA: everything in lib/totp.ts is pure and unit
 * tested, everything that touches Postgres lives here.
 *
 * One entry point matters — consumeSecondFactor() — and it is deliberately
 * the only place a second factor is ever accepted, so the replay guard and
 * the single-use bookkeeping cannot be forgotten at a new call site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  compareRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  newTotpSecret,
  normaliseRecoveryCode,
  otpAuthUri,
  verifyTotpCode,
} from "@/lib/totp";

/** How the user proved themselves, so the caller can tell them about it. */
export type SecondFactorResult =
  | { ok: true; method: "totp" }
  /** Recovery codes are finite; the count is surfaced in the UI as a nudge. */
  | { ok: true; method: "recovery"; remaining: number }
  | { ok: false };

/**
 * A six-digit string is a TOTP code; anything else is treated as a recovery
 * code. Both are accepted in the same input box because a locked-out admin
 * should not have to find a second field to paste into.
 */
function looksLikeTotp(input: string): boolean {
  return /^\s*\d{3}\s?\d{3}\s*$/.test(input);
}

/**
 * Check a second factor and spend it.
 *
 * Returns `{ ok: false }` for every failure — wrong code, replayed code,
 * account with no 2FA, undecryptable secret — because the sign-in form
 * must not distinguish them. The audit trail is the server log.
 */
export async function consumeSecondFactor(
  userId: string,
  input: string,
): Promise<SecondFactorResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
  });

  if (!user?.totpSecret || !user.totpEnabledAt) return { ok: false };

  if (looksLikeTotp(input)) {
    let secret: string;

    try {
      secret = decryptSecret(user.totpSecret);
    } catch {
      // Almost always a rotated NEXTAUTH_SECRET. Loud in the log, silent to
      // the user, and recoverable with a recovery code or a SUPER_ADMIN reset.
      console.error(`[2fa] cannot decrypt TOTP secret for user ${userId}`);
      return { ok: false };
    }

    const check = await verifyTotpCode(secret, input, user.totpLastStep);

    if (!check.ok) return { ok: false };

    // Burn the step so the same code cannot be presented twice.
    await prisma.user.update({
      where: { id: userId },
      data: { totpLastStep: check.step },
    });

    return { ok: true, method: "totp" };
  }

  const candidate = normaliseRecoveryCode(input);

  if (!candidate) return { ok: false };

  const unused = await prisma.recoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  for (const row of unused) {
    if (!(await compareRecoveryCode(candidate, row.codeHash))) continue;

    await prisma.recoveryCode.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    return { ok: true, method: "recovery", remaining: unused.length - 1 };
  }

  return { ok: false };
}

/**
 * Replace every recovery code with a fresh set.
 *
 * Returns the plaintext codes — the only moment they exist outside the
 * user's own record of them. Called when 2FA is switched on and whenever
 * the user asks for a new set.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map(hashRecoveryCode));

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    }),
  ]);

  return codes;
}

/** How many recovery codes the user has left, for the account page. */
export function countUnusedRecoveryCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}

/**
 * Turn 2FA off and destroy every artefact of it.
 *
 * Used both by the user disabling it themselves and by a SUPER_ADMIN
 * resetting someone who lost their phone — in the reset case the account is
 * left un-enrolled, and the enrolment gate walks them through setup again
 * at their next sign-in.
 */
export async function clearTwoFactor(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}

/**
 * The secret currently being enrolled, and the otpauth:// URI for its QR.
 *
 * An unconfirmed secret is reused across page loads rather than regenerated:
 * someone who scans the QR and then refreshes before typing the code would
 * otherwise be entering a code for a secret the server had already thrown
 * away. The secret stays inert — totpEnabledAt is what makes 2FA real — so
 * an abandoned enrolment costs nothing and is simply overwritten later.
 *
 * Deliberately NOT a server action: it takes a userId, and an exported
 * action taking a userId is an action anyone can call with someone else's.
 * The page passes the id it got from the session guard.
 */
export async function startEnrolment(
  userId: string,
  email: string,
): Promise<{ secret: string; uri: string }> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });

  let secret: string | null = null;

  if (existing?.totpSecret && !existing.totpEnabledAt) {
    try {
      secret = decryptSecret(existing.totpSecret);
    } catch {
      // Unreadable (rotated NEXTAUTH_SECRET) — start clean.
      secret = null;
    }
  }

  if (!secret) {
    secret = newTotpSecret();
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: encryptSecret(secret),
        totpEnabledAt: null,
        totpLastStep: null,
      },
    });
  }

  return { secret, uri: await otpAuthUri(secret, email) };
}
