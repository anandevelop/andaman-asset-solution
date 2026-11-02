/**
 * lib/report-recipients.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who the monthly report, the SEO alerts and the staff summaries go to.
 *
 * Edited on /admin/reports, so changing who gets the report no longer
 * means editing the server's .env and restarting it. REPORT_RECIPIENTS
 * still works and is the fallback: once a list is saved in the back office
 * it wins, and saving an empty list hands control back to the variable.
 *
 * Stored in site_settings under a key lib/settings.ts does not read, so the
 * addresses never reach the public site's settings object.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { reportRecipients as envRecipients } from "@/lib/email";

const KEY = "reports.recipients";
export const MAX_RECIPIENTS = 20;

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * "a@x.com, B@x.com\nc@y.com" → valid addresses, lower-cased, de-duplicated,
 * in order; plus whatever did not look like an address.
 */
export function parseRecipients(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const value = part.trim().toLowerCase();
    if (!value) continue;
    if (!EMAIL.test(value) || value.length > 254) invalid.push(part.trim());
    else if (!valid.includes(value)) valid.push(value);
  }
  return { valid, invalid };
}

export type RecipientList = { recipients: string[]; source: "admin" | "env" | null };

export async function getReportRecipients(): Promise<RecipientList> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: KEY }, select: { value: true } });
    const saved = row ? parseRecipients(row.value).valid : [];
    if (saved.length > 0) return { recipients: saved, source: "admin" };
  } catch (error) {
    // The database being down must not also take the env fallback away.
    console.error("[report-recipients] could not read the saved list", error);
  }
  const env = envRecipients();
  return { recipients: env, source: env.length > 0 ? "env" : null };
}

/** An empty list removes the row, so REPORT_RECIPIENTS applies again. */
export async function saveReportRecipients(list: string[], actorId?: string): Promise<void> {
  if (list.length === 0) {
    await prisma.siteSetting.deleteMany({ where: { key: KEY } });
    return;
  }
  const value = list.join(", ");
  await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedBy: actorId ?? null },
    update: { value, updatedBy: actorId ?? null },
  });
}
