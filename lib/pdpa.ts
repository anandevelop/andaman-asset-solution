/**
 * lib/pdpa.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read-only PDPA (Thailand Personal Data Protection Act) compliance
 * overview for /admin/settings/privacy — every number here comes from a
 * real column already collected at submission time (LeadInquiry and
 * EventRegistration both carry consentGiven/consentedAt/consentVersion).
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM.
 *
 * There is no background job in this application (see the "no cron
 * infrastructure" note elsewhere in this codebase, e.g.
 * ContentRevision/scheduledPublishAt), so there is no automatic retention
 * window or deletion schedule enforced anywhere — RETENTION_YEARS below and
 * retentionTargetDate() are a *reference date to work toward*, the same
 * honest framing scheduledPublishAt already uses for "a target, not a
 * timer." Nothing reads that date to delete anything on its own; an admin
 * still has to act. Showing no date at all, though, meant an operator had
 * to keep the retention period in their head and do the arithmetic by
 * hand every time PDPA compliance came up — this trades that for a
 * clearly-labelled reference, not a claim of automation.
 *
 * Erasure requests are handled the same way any manual PDPA request is:
 * an admin locates the person's records (Leads, Event registrations) and
 * edits or removes them directly. This page's job is to make the current
 * state legible, not to pretend a retention job is running.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { siteConfig } from "@/config/site";

/**
 * How long lead/enquiry data is kept before it should be reviewed for
 * deletion — a policy figure, not a technical one. Three years matches
 * this business's own general commercial-records retention practice;
 * change it here rather than wherever a date happens to be displayed.
 */
export const PDPA_RETENTION_YEARS = 3;

/** consentedAt + PDPA_RETENTION_YEARS, or null if consent was never given
 *  (there is nothing to retire a date against). A reference to work
 *  toward — see the file header for why this is not an automatic timer. */
export function retentionTargetDate(consentedAt: Date | null): Date | null {
  if (!consentedAt) return null;
  const target = new Date(consentedAt);
  target.setFullYear(target.getFullYear() + PDPA_RETENTION_YEARS);
  return target;
}

export type ConsentSourceSummary = {
  total: number;
  consented: number;
  notConsented: number;
  /** consentVersion set, but not the current siteConfig.legal.consentVersion. */
  outdatedVersion: number;
};

export type PdpaOverview = {
  currentPolicyVersion: string;
  leads: ConsentSourceSummary;
  eventRegistrations: ConsentSourceSummary;
};

async function summarize(
  countAll: () => Promise<number>,
  countConsented: () => Promise<number>,
  countOutdated: () => Promise<number>,
): Promise<ConsentSourceSummary> {
  const [total, consented, outdatedVersion] = await Promise.all([
    safeQuery("pdpa:count(all)", countAll, 0),
    safeQuery("pdpa:count(consented)", countConsented, 0),
    safeQuery("pdpa:count(outdated)", countOutdated, 0),
  ]);

  return {
    total,
    consented,
    notConsented: Math.max(0, total - consented),
    outdatedVersion,
  };
}

export async function getPdpaOverview(): Promise<PdpaOverview> {
  const currentPolicyVersion = siteConfig.legal.consentVersion;

  const [leads, eventRegistrations] = await Promise.all([
    summarize(
      () => prisma.leadInquiry.count(),
      () => prisma.leadInquiry.count({ where: { consentGiven: true } }),
      () =>
        prisma.leadInquiry.count({
          where: {
            consentGiven: true,
            consentVersion: { not: null, notIn: [currentPolicyVersion] },
          },
        }),
    ),
    summarize(
      () => prisma.eventRegistration.count(),
      () => prisma.eventRegistration.count({ where: { consentGiven: true } }),
      () =>
        prisma.eventRegistration.count({
          where: {
            consentGiven: true,
            consentVersion: { not: null, notIn: [currentPolicyVersion] },
          },
        }),
    ),
  ]);

  return { currentPolicyVersion, leads, eventRegistrations };
}
