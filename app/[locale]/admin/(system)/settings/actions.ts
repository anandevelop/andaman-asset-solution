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
 *
 * It is also partial-update safe by construction: the loop skips any key
 * the submitted form did not carry (`raw === null`), so two different pages
 * can each edit their own subset of SETTING_KEYS through this one action
 * without wiping each other's values. /admin/settings and
 * /admin/settings/seo both rely on that — do not "tidy" the null check into
 * treating a missing field as a clear.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { updateTag, revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { sendDiagnosticEmail } from "@/lib/email";
import { SETTING_VALIDATORS } from "@/lib/validations";
import {
  SETTING_KEYS,
  IMAGE_SETTING_KEYS,
  defaultSettings,
  isSettingKey,
  type SettingKey,
} from "@/lib/settings";

export type SettingsFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
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

  const defaults = defaultSettings();
  const imageKeys = new Set<SettingKey>(IMAGE_SETTING_KEYS);

  for (const key of SETTING_KEYS) {
    const raw = formData.get(key);
    if (raw === null) continue;

    const value = String(raw).trim();

    if (value.length === 0) {
      toClear.push(key);
      continue;
    }

    /*
      Submitting the committed default is a clear, not an override — but
      only for the image fields.

      They are the one kind of field with no placeholder: an uploader has
      to preview something, so it previews the *effective* value, which is
      the default until someone overrides it. Saving an untouched form
      would therefore write a row identical to the default, which is inert
      today and becomes a stale override the day config/site.ts changes.

      Deliberately not generalised to every key. Two of the analytics
      defaults come from env vars, and silently deleting a row because the
      operator typed today's NEXT_PUBLIC_GA_ID would re-couple that value
      to the environment behind their back.
    */
    if (imageKeys.has(key) && value === defaults[key]) {
      toClear.push(key);
      continue;
    }

    // Bounded, so a settings row cannot become an accidental blob. Checked
    // before the validator so a pasted essay is reported as "too long"
    // rather than as a failed shape.
    if (value.length > 500) {
      errors[key] = "Too long";
      continue;
    }

    const validator = SETTING_VALIDATORS[key];
    if (!validator) {
      toWrite.push({ key, value });
      continue;
    }

    const parsed = validator.safeParse(value);
    if (!parsed.success) {
      errors[key] = parsed.error.issues[0]?.message ?? "Invalid value";
      continue;
    }

    // parsed.data, not the raw value: several validators normalise (a GA4
    // id is uppercased, a Twitter handle gains its @), and writing `value`
    // here would silently discard every one of those transforms.
    toWrite.push({ key, value: parsed.data });
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

  /* Clears the unstable_cache entry so the change is live on the next
     render rather than after the revalidate window.

     updateTag, not revalidateTag: since Next 16 the two are different
     calls, and only updateTag expires the entry immediately. revalidateTag
     now takes a cacheLife profile and schedules the expiry — which in a
     save action would mean the admin reloading the settings page and
     reading back the values they just replaced. */
  updateTag("site-settings");

  /*
    Contact details appear in the footer, which is on every page — and the
    branding and SEO keys reach further still, into the <title>, <meta> and
    <link rel="icon"> that generateMetadata bakes into every prerender.

    revalidatePath("/", "layout") is already the widest purge there is:
    every cached route derives the root layout first, so this invalidates
    all of them. The narrower per-locale loop in settings/company/actions.ts
    covers a strict subset of the same thing — copying it here would be a
    downgrade wearing the costume of thoroughness.

    What it does NOT reach is spelled out below.
  */
  revalidatePath("/", "layout");

  // "layout", so the purge covers /admin/settings/seo as well — a
  // page-type purge would stop at this route's own segment.
  revalidatePath(`/${locale}/admin/settings`, "layout");

  // The manifest reads branding.faviconUrl (app/manifest.ts). It should be
  // covered by the root purge above, but manifest generation is a
  // special-cased metadata route whose caching has moved between Next
  // minors, and one line is cheaper than the bug report.
  revalidatePath("/manifest.webmanifest");

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

  updateTag("site-settings");
  return true;
}

// ── Diagnostics ─────────────────────────────────────────────────────────

export type TestEmailResult = { ok: boolean; message: string };

/**
 * Send a test message to the administrator who pressed the button.
 *
 * To themselves, deliberately: it needs no address field, it cannot be
 * used to send mail to a stranger, and the person who has to decide
 * whether SMTP works is the one who will see whether it arrived.
 */
export async function sendTestEmail(locale: string): Promise<TestEmailResult> {
  const session = await requireAdminAction(Role.ADMIN);

  const result = await sendDiagnosticEmail(session.email);

  if (result.ok) {
    return { ok: true, message: `${await testMessage(locale, "sent")} ${session.email}` };
  }

  if (result.error === "NOT_CONFIGURED") {
    return { ok: false, message: await testMessage(locale, "notConfigured") };
  }

  // The SMTP server's own words, which is what makes this button useful.
  return { ok: false, message: `${await testMessage(locale, "failed")} ${result.error}` };
}

async function testMessage(locale: string, key: "sent" | "failed" | "notConfigured") {
  const t = await getTranslations({ locale, namespace: "admin" });
  return t(`settings.health.testResult.${key}`);
}
