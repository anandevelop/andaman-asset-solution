/**
 * lib/careers/config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What HR sets for the careers section without a deploy: the invitation
 * shown above the open positions (per language), how long an application
 * is kept, and the mailbox a copy of each one goes to.
 *
 * Rows in site_settings under keys lib/settings.ts does not read, the same
 * arrangement as lib/pagespeed/config.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { locales, type Locale } from "@/i18n";
import { DEFAULT_RETENTION_MONTHS, RETENTION_CHOICES } from "@/lib/careers/fields";

const KEY = {
  copy: "careers.copy",
  retention: "careers.retentionMonths",
  notifyEmail: "careers.notifyEmail",
} as const;

/** Where the copy of each application goes unless HR has set another. */
export const DEFAULT_NOTIFY_EMAIL = "hr@andamanassetsolution.com";

export type CareersCopy = { title: string; intro: string };

export type CareersConfig = {
  /** Only the languages HR has written; the rest fall back to the site's
   *  own messages (about.careers.*). */
  copy: Partial<Record<Locale, CareersCopy>>;
  retentionMonths: number;
  notifyEmail: string;
};

function parseCopy(raw: string | undefined): CareersConfig["copy"] {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, Partial<CareersCopy>>;
    const out: CareersConfig["copy"] = {};
    for (const locale of locales) {
      const entry = value?.[locale];
      const title = typeof entry?.title === "string" ? entry.title.trim() : "";
      const intro = typeof entry?.intro === "string" ? entry.intro.trim() : "";
      if (title || intro) out[locale] = { title, intro };
    }
    return out;
  } catch {
    return {};
  }
}

export async function getCareersConfig(): Promise<CareersConfig> {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.siteSetting.findMany({
      where: { key: { in: Object.values(KEY) } },
      select: { key: true, value: true },
    });
  } catch (error) {
    console.error("[careers] could not read settings", error);
  }
  const row = (key: string) => rows.find((entry) => entry.key === key)?.value;

  const months = Number(row(KEY.retention));
  const email = row(KEY.notifyEmail)?.trim();

  return {
    copy: parseCopy(row(KEY.copy)),
    retentionMonths: (RETENTION_CHOICES as readonly number[]).includes(months) ? months : DEFAULT_RETENTION_MONTHS,
    notifyEmail: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : DEFAULT_NOTIFY_EMAIL,
  };
}

export async function saveCareersConfig(
  input: { copy?: CareersConfig["copy"]; retentionMonths?: number; notifyEmail?: string },
  actorId?: string,
): Promise<void> {
  const put = (key: string, value: string) =>
    prisma.siteSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: actorId ?? null },
      update: { value, updatedBy: actorId ?? null },
    });

  if (input.copy) await put(KEY.copy, JSON.stringify(input.copy));
  if (input.retentionMonths !== undefined) await put(KEY.retention, String(input.retentionMonths));
  if (input.notifyEmail !== undefined) await put(KEY.notifyEmail, input.notifyEmail.trim());
}
