"use server";

/**
 * app/[locale]/admin/settings/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Save site settings.
 *
 * Two rules make this safe to hand to a non-developer:
 *
 *  1. Only keys in SETTING_KEYS are written. A crafted form field naming an
 *     arbitrary key is dropped, so the settings table cannot become a
 *     general-purpose write target.
 *  2. A field cleared to empty deletes its row rather than storing "". The
 *     value then falls back to config/site.ts, which means "reset to
 *     default" needs no separate button — clearing the box is the reset.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidateTag, revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { SETTING_KEYS, isSettingKey, type SettingKey } from "@/lib/settings";

export type SettingsFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

/**
 * Per-key validation. A phone number that is not a phone number renders
 * a broken `tel:` link on every page, so the shapes are checked here rather
 * than trusted.
 */
const VALIDATORS: Partial<Record<SettingKey, z.ZodType<string>>> = {
  "contact.phone": z
    .string()
    .regex(/^[0-9+()\-\s]{6,20}$/, "Enter a valid phone number"),
  "contact.whatsapp": z
    .string()
    .regex(/^[0-9+]{6,20}$/, "Digits and + only"),
  "contact.email": z.string().email("Enter a valid email address"),
  "contact.salesEmail": z.string().email("Enter a valid email address"),
  "contact.mapUrl": z.string().url("Enter a full https:// URL"),
  "social.facebook": z.string().url("Enter a full https:// URL"),
  "social.instagram": z.string().url("Enter a full https:// URL"),
  "social.youtube": z.string().url("Enter a full https:// URL"),
  // Facebook Events Manager gives out a plain numeric ID — a pasted-in
  // <script> tag or share URL is the most common mistake, so this catches
  // it before the pixel silently fails to load.
  "analytics.metaPixelId": z
    .string()
    .regex(/^\d{6,20}$/, "Enter just the numeric Pixel ID, not the full script"),
  // Google's verification code is an opaque token, not a fixed shape — the
  // length cap below is the only real guard.
};

export async function updateSettings(
  locale: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  // Contact details are the company's public identity. Changing them is an
  // ADMIN act, not an editorial one.
  const actor = await requireAdminAction(Role.ADMIN);

  const errors: Record<string, string> = {};
  const toWrite: { key: SettingKey; value: string }[] = [];
  const toClear: SettingKey[] = [];

  for (const key of SETTING_KEYS) {
    const raw = formData.get(key);
    if (raw === null) continue;

    const value = String(raw).trim();

    if (value.length === 0) {
      toClear.push(key);
      continue;
    }

    const validator = VALIDATORS[key];
    if (validator) {
      const parsed = validator.safeParse(value);
      if (!parsed.success) {
        errors[key] = parsed.error.issues[0]?.message ?? "Invalid value";
        continue;
      }
    }

    // Bounded, so a settings row cannot become an accidental blob.
    if (value.length > 500) {
      errors[key] = "Too long";
      continue;
    }

    toWrite.push({ key, value });
  }

  if (Object.keys(errors).length > 0) return { ok: false, fields: errors };

  try {
    await prisma.$transaction([
      ...toWrite.map(({ key, value }) =>
        prisma.siteSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: actor.id },
          update: { value, updatedBy: actor.id },
        }),
      ),
      // deleteMany, not delete: a key with no row is the normal case and
      // delete would throw on it.
      prisma.siteSetting.deleteMany({ where: { key: { in: toClear } } }),
    ]);
  } catch (error) {
    console.error("[updateSettings] failed", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  // Clears the unstable_cache entry so the change is live on the next
  // render rather than after the revalidate window.
  revalidateTag("site-settings");

  // Contact details appear in the footer, which is on every page.
  revalidatePath("/", "layout");
  revalidatePath(`/${locale}/admin/settings`);

  return { ok: true, message: "SAVED" };
}

/** Guarded write-through for a stray key — used by nothing yet, but the
 *  validation lives in one place if a future caller needs it. */
export async function setSetting(key: string, value: string): Promise<boolean> {
  await requireAdminAction(Role.ADMIN);

  if (!isSettingKey(key)) return false;

  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });

  revalidateTag("site-settings");
  return true;
}
