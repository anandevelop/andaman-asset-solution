/**
 * lib/settings.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Operator-editable overrides for config/site.ts.
 *
 * Only the details that change without a deploy live here: phone number,
 * LINE OA, sales office address, the Meta Pixel ID and the Google Search
 * Console verification code. Brand copy, SEO defaults and legal paths
 * stay in config/site.ts, where a change is reviewable in a pull request.
 *
 * The merge is one-directional and total: config/site.ts is always the
 * fallback, so an empty settings table, an unreachable database, or a
 * cleared field all resolve to the committed default rather than to blank.
 * A site that renders no phone number because a row is missing is worse
 * than one showing a slightly stale one.
 *
 * `unstable_cache` keeps this to one query per revalidation window instead
 * of one per component that asks — the footer, the contact page and the
 * JSON-LD block all read it on the same render.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { siteConfig } from "@/config/site";

/**
 * The complete set of editable keys.
 *
 * Anything not listed here is ignored on read and rejected on write, so a
 * stray row cannot silently change behaviour and the admin form cannot
 * invent a key that nothing consumes.
 */
export const SETTING_KEYS = [
  "contact.phone",
  "contact.phoneDisplay",
  "contact.whatsapp",
  "contact.email",
  "contact.salesEmail",
  "contact.addressTh",
  "contact.addressEn",
  "contact.addressZh",
  "contact.addressRu",
  "contact.officeHoursTh",
  "contact.officeHoursEn",
  "contact.officeHoursZh",
  "contact.officeHoursRu",
  "contact.mapUrl",
  "social.facebook",
  "social.instagram",
  "social.youtube",
  "analytics.metaPixelId",
  "analytics.googleSiteVerification",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}

/** Resolved settings — the same shape whatever the database says. */
export type SiteSettings = {
  contact: {
    phone: string;
    phoneDisplay: string;
    whatsapp: string;
    email: string;
    salesEmail: string;
    address: { th: string; en: string; zh: string; ru: string };
    officeHours: { th: string; en: string; zh: string; ru: string };
    mapUrl: string;
  };
  social: {
    facebook: string;
    instagram: string;
    youtube: string;
  };
  analytics: {
    /** Facebook Events Manager → the numeric Pixel ID, nothing else. */
    metaPixelId: string;
    /** The `content` value of Google's `google-site-verification` meta
     *  tag — just the code, not the whole tag. */
    googleSiteVerification: string;
  };
};

/** config/site.ts flattened into the same key space, as the fallback. */
export function defaultSettings(): Record<SettingKey, string> {
  return {
    "contact.phone": siteConfig.contact.phone,
    "contact.phoneDisplay": siteConfig.contact.phoneDisplay,
    "contact.whatsapp": siteConfig.contact.whatsapp,
    "contact.email": siteConfig.contact.email,
    "contact.salesEmail": siteConfig.contact.salesEmail,
    "contact.addressTh": siteConfig.contact.address.th,
    "contact.addressEn": siteConfig.contact.address.en,
    "contact.addressZh": siteConfig.contact.address.zh,
    "contact.addressRu": siteConfig.contact.address.ru,
    "contact.officeHoursTh": siteConfig.contact.officeHours.th,
    "contact.officeHoursEn": siteConfig.contact.officeHours.en,
    "contact.officeHoursZh": siteConfig.contact.officeHours.zh,
    "contact.officeHoursRu": siteConfig.contact.officeHours.ru,
    "contact.mapUrl": siteConfig.contact.mapUrl,
    "social.facebook": siteConfig.social.facebook,
    "social.instagram": siteConfig.social.instagram,
    "social.youtube": siteConfig.social.youtube,
    // Env vars are the deploy-time fallback — the admin field takes
    // priority the moment someone fills it in, same as every other key
    // here, but a fresh environment with nothing in the database yet still
    // picks up whatever was set at build/deploy time.
    "analytics.metaPixelId": process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "",
    "analytics.googleSiteVerification": process.env.GOOGLE_SITE_VERIFICATION ?? "",
  };
}

/**
 * Flat key-value map, defaults merged with whatever the database holds.
 *
 * Total failure containment, and it has to be. Every page reads this — it
 * is called from the root layout for the chat button and from (site)/layout
 * for the navbar phone number — so anything that throws here takes down the
 * entire site, public pages included.
 *
 * safeQuery alone is not enough. It catches Prisma's *connection* errors,
 * but the failure that actually bit was `prisma.siteSetting` being
 * `undefined` because the client had not been regenerated after the
 * migration was added. That is a TypeError thrown before any query runs,
 * so isDatabaseOfflineError() correctly says no and rethrows it.
 *
 * The contract this module advertises is "config/site.ts is always the
 * fallback". This try/catch is what makes that true for every failure mode
 * rather than only the ones Prisma names.
 */
async function readMergedSettings(): Promise<Record<SettingKey, string>> {
  const merged = defaultSettings();

  try {
    // Guarded explicitly so the cause is named in the log rather than
    // surfacing as "cannot read properties of undefined" three frames up.
    if (!prisma.siteSetting) {
      console.error(
        "[settings] prisma.siteSetting is undefined — the Prisma Client " +
          "predates the site_settings migration. Run `npx prisma migrate dev` " +
          "(or `migrate deploy` in production) and restart. Serving " +
          "config/site.ts defaults meanwhile.",
      );
      return merged;
    }

    const rows = await safeQuery(
      "siteSetting.findMany",
      () => prisma.siteSetting.findMany({ select: { key: true, value: true } }),
      [] as { key: string; value: string }[],
    );

    for (const row of rows) {
      // An unknown key is ignored, and a blank value falls back — clearing
      // a field in the admin should restore the default, not empty the site.
      if (isSettingKey(row.key) && row.value.trim().length > 0) {
        merged[row.key] = row.value.trim();
      }
    }
  } catch (error) {
    // A missing table (P2021) before the migration lands, a dropped
    // connection, anything else — the site still renders.
    console.error("[settings] falling back to config/site.ts defaults", error);
  }

  return merged;
}

/**
 * Cached across requests. `revalidateTag("site-settings")` in the admin
 * action clears it, so a saved change is live on the next render rather
 * than after a timeout.
 */
const readCached = unstable_cache(readMergedSettings, ["site-settings"], {
  tags: ["site-settings"],
  // Backstop only. The tag is the mechanism.
  revalidate: 3600,
});

/** The structured settings every consumer reads. */
export async function getSiteSettings(): Promise<SiteSettings> {
  const values = await readCached();

  return {
    contact: {
      phone: values["contact.phone"],
      phoneDisplay: values["contact.phoneDisplay"],
      whatsapp: values["contact.whatsapp"],
      email: values["contact.email"],
      salesEmail: values["contact.salesEmail"],
      address: {
        th: values["contact.addressTh"],
        en: values["contact.addressEn"],
        zh: values["contact.addressZh"],
        ru: values["contact.addressRu"],
      },
      officeHours: {
        th: values["contact.officeHoursTh"],
        en: values["contact.officeHoursEn"],
        zh: values["contact.officeHoursZh"],
        ru: values["contact.officeHoursRu"],
      },
      mapUrl: values["contact.mapUrl"],
    },
    social: {
      facebook: values["social.facebook"],
      instagram: values["social.instagram"],
      youtube: values["social.youtube"],
    },
    analytics: {
      metaPixelId: values["analytics.metaPixelId"],
      googleSiteVerification: values["analytics.googleSiteVerification"],
    },
  };
}

/** Raw map for the admin form, which edits keys rather than the structure. */
export async function getSettingsForEditing(): Promise<Record<SettingKey, string>> {
  return readMergedSettings();
}

/** Which keys currently differ from the committed defaults. */
export async function getOverriddenKeys(): Promise<SettingKey[]> {
  const [current, defaults] = [await readMergedSettings(), defaultSettings()];

  return SETTING_KEYS.filter((key) => current[key] !== defaults[key]);
}
