"use server";

/**
 * app/[locale]/admin/users/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Account administration. Every action here is SUPER_ADMIN-only: creating a
 * user is the act of granting access to the system, so it sits at the
 * highest privilege rather than alongside content editing.
 *
 * Three invariants are enforced on the server, not just hidden in the UI:
 *
 *   1. You cannot change your own role or deactivate yourself. Otherwise a
 *      sole super admin can demote themselves and lock the whole team out
 *      with no way back except a shell.
 *   2. You cannot delete yourself, for the same reason.
 *   3. The last active SUPER_ADMIN cannot be removed, demoted or disabled.
 *
 * Deletion is hard, but safe: NewsArticle.authorId and
 * ProjectProgress.publishedBy are both onDelete: SetNull, so the content
 * survives and simply loses its byline.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { clearTwoFactor } from "@/lib/two-factor";
import {
  changePasswordSchema,
  setPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
  fieldErrors,
} from "@/lib/validations";

/** Cost 12 ≈ 250ms on modern hardware — slow enough to matter offline,
 *  fast enough that a login does not feel laggy. */
const BCRYPT_ROUNDS = 12;

export type UserFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function text(formData: FormData, key: string): string {
  return (formData.get(key) as string | null) ?? "";
}

/**
 * True when `userId` is the only SUPER_ADMIN still active. Used to refuse
 * the edit that would leave the system with no one able to administer it.
 */
async function isLastSuperAdmin(userId: string): Promise<boolean> {
  const remaining = await prisma.user.count({
    where: { role: Role.SUPER_ADMIN, isActive: true, id: { not: userId } },
  });
  return remaining === 0;
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createUser(
  locale: string,
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdminAction(Role.SUPER_ADMIN);

  const parsed = userCreateSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    role: text(formData, "role"),
    password: text(formData, "password"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { password, ...rest } = parsed.data;

  try {
    await prisma.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, fields: { email: "EMAIL_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/users`);
  return { ok: true, message: "CREATED" };
}

// ── Update profile / role / active ──────────────────────────────────────

export async function updateUser(
  locale: string,
  id: string,
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requireAdminAction(Role.SUPER_ADMIN);

  const parsed = userUpdateSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    role: text(formData, "role"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, isActive: true },
  });

  if (!target) return { ok: false, message: "NOT_FOUND" };

  const losesPrivilege =
    parsed.data.role !== Role.SUPER_ADMIN || !parsed.data.isActive;

  // Invariant 1 — no self-demotion, no self-deactivation.
  if (actor.id === id && losesPrivilege) {
    return { ok: false, message: "CANNOT_DEMOTE_SELF" };
  }

  // Invariant 3 — never strip the final super admin.
  if (
    target.role === Role.SUPER_ADMIN &&
    target.isActive &&
    losesPrivilege &&
    (await isLastSuperAdmin(id))
  ) {
    return { ok: false, message: "LAST_SUPER_ADMIN" };
  }

  try {
    await prisma.user.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, fields: { email: "EMAIL_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/admin/users/${id}/edit`);
  return { ok: true, message: "SAVED" };
}

// ── Set another user's password ─────────────────────────────────────────

export async function setUserPassword(
  locale: string,
  id: string,
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdminAction(Role.SUPER_ADMIN);

  const parsed = setPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });

  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  try {
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
        /*
          This is the incident path — a SUPER_ADMIN rotating the password of
          an account believed to be compromised. Without the stamp it did
          nothing to whoever is already inside: their token stayed valid for
          the rest of its eight hours. lib/auth.ts refuses sessions issued
          before this moment on their next revalidation.
        */
        credentialsChangedAt: new Date(),
      },
    });
  } catch {
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/users/${id}/edit`);
  return { ok: true, message: "PASSWORD_SET" };
}

// ── Change your own password ────────────────────────────────────────────

export async function changeOwnPassword(
  locale: string,
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  // Any signed-in role may change their own password — Role.VIEWER, not
  // the requireAdminAction() default of EDITOR, which the bare call above
  // silently substituted, contradicting this comment for every VIEWER and
  // SALES account.
  const actor = await requireAdminAction(Role.VIEWER);

  const parsed = changePasswordSchema.safeParse({
    currentPassword: text(formData, "currentPassword"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });

  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) return { ok: false, message: "SAVE_FAILED" };

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, fields: { currentPassword: "WRONG_PASSWORD" } };

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
      /*
        Changing your own password ends every session it was valid for,
        including this one.

        That is the point: someone who changes their password because they
        think it has leaked expects the other party to be thrown out, and a
        JWT carries no session id to be selective with. The cost is that
        the person who just changed it is signed out too, within
        ROLE_REFRESH_MS rather than immediately — so it reads as being
        logged out a few minutes later for no visible reason.

        Left this way deliberately: the alternative is to leave a known-bad
        password's sessions alive on the one path a worried user takes.
      */
      credentialsChangedAt: new Date(),
    },
  });

  revalidatePath(`/${locale}/admin/account`);
  return { ok: true, message: "PASSWORD_SET" };
}

// ── Two-factor reset ────────────────────────────────────────────────────

/**
 * Clear another user's 2FA enrolment — the lost-phone path.
 *
 * SUPER_ADMIN only, and deliberately not self-service: an account that can
 * reset its own second factor from inside the session does not have one.
 * The reset is logged rather than silent, because "who unlocked this
 * account and when" is the first question after an incident.
 */
export async function resetUserTwoFactor(locale: string, id: string): Promise<void> {
  const actor = await requireAdminAction(Role.SUPER_ADMIN);

  await clearTwoFactor(id);

  /*
    Stamped here rather than inside clearTwoFactor(), which is also the
    self-service disable path in account/security/actions.ts — that one
    already proves possession with a password and a live code, and signing
    the user out of the session they are standing in would be noise.

    This call is the lost-phone reset performed by someone else, so it
    belongs with the other incident paths: whatever sessions the account
    had are no longer trusted.
  */
  await prisma.user
    .update({ where: { id }, data: { credentialsChangedAt: new Date() } })
    .catch(() => null);

  console.warn(`[2fa] ${actor.email} reset two-factor for user ${id}`);

  revalidatePath(`/${locale}/admin/users/${id}/edit`);
}

// ── Delete ──────────────────────────────────────────────────────────────

export async function deleteUser(locale: string, id: string): Promise<void> {
  const actor = await requireAdminAction(Role.SUPER_ADMIN);

  // Invariants 2 and 3. These throw rather than returning a result: the
  // delete form navigates away on success, so there is no state to render
  // an inline error into — and the UI already hides the button in both
  // cases, meaning reaching here is a bypass attempt, not a user mistake.
  if (actor.id === id) throw new Error("CANNOT_DELETE_SELF");

  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, isActive: true },
  });

  if (!target) throw new Error("NOT_FOUND");

  if (
    target.role === Role.SUPER_ADMIN &&
    target.isActive &&
    (await isLastSuperAdmin(id))
  ) {
    throw new Error("LAST_SUPER_ADMIN");
  }

  await prisma.user.delete({ where: { id } });

  revalidatePath(`/${locale}/admin/users`);
  redirect(`/${locale}/admin/users`);
}
