"use server";

/**
 * app/[locale]/admin/account/security/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Enrol, disable and re-key two-factor authentication for your own account.
 *
 * Every action passes `allowTwoFactorSetup` to the guard: this page is the
 * one place an ADMIN who still owes enrolment is allowed to act, because
 * otherwise the gate that forces setup would also block setup.
 *
 * Turning 2FA *off* is treated as sensitive as turning it on — password and
 * a live code, the same pair that would let an attacker in. An unlocked
 * laptop should not be enough to quietly remove the second factor.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit, resetRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { decryptSecret, verifyTotpCode } from "@/lib/totp";
import { clearTwoFactor, consumeSecondFactor, issueRecoveryCodes } from "@/lib/two-factor";

export type TwoFactorState = {
  ok: boolean;
  message?: string;
  /** Present exactly once, on the response that mints them. */
  codes?: string[];
};

function text(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? "").trim();
}

/** Confirm the first code and switch 2FA on, returning the recovery codes. */
export async function confirmTwoFactor(
  locale: string,
  _previous: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  // Role.VIEWER, not the requireAdminAction() default of EDITOR — see the
  // matching note on the security page's own guard: a bare call here
  // rejected any VIEWER or SALES account before allowTwoFactorSetup got a
  // say, so the one action that finishes enrolment was unreachable by the
  // one role band that most needed it reachable.
  const actor = await requireAdminAction(Role.VIEWER, { allowTwoFactorSetup: true });

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { totpSecret: true, totpEnabledAt: true },
  });

  if (!user?.totpSecret) return { ok: false, message: "SETUP_EXPIRED" };
  if (user.totpEnabledAt) return { ok: false, message: "ALREADY_ENABLED" };

  const key = `2fa-setup:${actor.id}`;

  if (!rateLimit(key, { ...RATE_LIMITS.twoFactor, check: true }).ok) {
    return { ok: false, message: "LOCKED" };
  }

  let secret: string;

  try {
    secret = decryptSecret(user.totpSecret);
  } catch {
    return { ok: false, message: "SETUP_EXPIRED" };
  }

  const check = await verifyTotpCode(secret, text(formData, "code"), null);

  if (!check.ok) {
    rateLimit(key, RATE_LIMITS.twoFactor);
    return { ok: false, message: "INVALID_CODE" };
  }

  resetRateLimit(key);

  await prisma.user.update({
    where: { id: actor.id },
    data: { totpEnabledAt: new Date(), totpLastStep: check.step },
  });

  const codes = await issueRecoveryCodes(actor.id);

  revalidatePath(`/${locale}/admin/account/security`);
  return { ok: true, message: "ENABLED", codes };
}

/** Replace the recovery codes. Requires a live second factor. */
export async function regenerateRecoveryCodes(
  locale: string,
  _previous: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  // Role.VIEWER — self-service on one's own already-enrolled factor, same
  // floor as changeOwnPassword and every other account/ action.
  const actor = await requireAdminAction(Role.VIEWER);

  const key = `2fa-setup:${actor.id}`;

  if (!rateLimit(key, { ...RATE_LIMITS.twoFactor, check: true }).ok) {
    return { ok: false, message: "LOCKED" };
  }

  const second = await consumeSecondFactor(actor.id, text(formData, "code"));

  if (!second.ok) {
    rateLimit(key, RATE_LIMITS.twoFactor);
    return { ok: false, message: "INVALID_CODE" };
  }

  resetRateLimit(key);

  const codes = await issueRecoveryCodes(actor.id);

  revalidatePath(`/${locale}/admin/account/security`);
  return { ok: true, message: "REGENERATED", codes };
}

/** Switch 2FA off. Password *and* a live code, both required. */
export async function disableTwoFactor(
  locale: string,
  _previous: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  // Role.VIEWER — same self-service floor as regenerateRecoveryCodes above.
  const actor = await requireAdminAction(Role.VIEWER);

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true, role: true },
  });

  if (!user?.passwordHash) return { ok: false, message: "FAILED" };

  const key = `2fa-setup:${actor.id}`;

  if (!rateLimit(key, { ...RATE_LIMITS.twoFactor, check: true }).ok) {
    return { ok: false, message: "LOCKED" };
  }

  const valid = await bcrypt.compare(text(formData, "password"), user.passwordHash);

  if (!valid) {
    rateLimit(key, RATE_LIMITS.twoFactor);
    return { ok: false, message: "WRONG_PASSWORD" };
  }

  const second = await consumeSecondFactor(actor.id, text(formData, "code"));

  if (!second.ok) {
    rateLimit(key, RATE_LIMITS.twoFactor);
    return { ok: false, message: "INVALID_CODE" };
  }

  resetRateLimit(key);

  await clearTwoFactor(actor.id);

  /*
    An ADMIN who disables 2FA has not escaped it — the session claim goes
    stale within five minutes and the enrolment gate takes over, so the next
    admin page they open is the setup page again. The UI says as much rather
    than letting them discover it by being redirected.
  */
  revalidatePath(`/${locale}/admin/account/security`);
  return { ok: true, message: "DISABLED" };
}
