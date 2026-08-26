/**
 * lib/cookie-consent-stats.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Anonymous, aggregate-only counters for the cookie banner — "what % of
 * decisions granted analytics/marketing", not "who decided what".
 *
 * Deliberately NOT a new Prisma model. The existing SiteSetting table
 * (prisma/schema.prisma) is already a generic (key, value) store; three
 * extra keys here need no migration. It is a different use of that table
 * than lib/settings.ts's admin-editable config — these keys are never
 * exposed through getSiteSettings() or the Settings admin page, and
 * incrementing one must NOT call revalidateTag("site-settings"), or every
 * visitor's cookie decision would invalidate the settings cache the rest of
 * the site reads on every request.
 *
 * Why not log a full record instead (visitor id, timestamp, IP)? Because
 * that would turn an anonymous, aggregate-only cookie banner into a second
 * collector of personal data with no consent basis of its own — the exact
 * thing PDPA data-minimisation is meant to prevent. Three running totals are
 * enough to answer "what % accept" and cannot be traced back to anyone.
 *
 * Increments use a raw atomic upsert (INSERT ... ON CONFLICT DO UPDATE)
 * rather than read-then-write, because two visitors deciding in the same
 * millisecond would otherwise race and one increment could be lost.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

const KEYS = {
  total: "cookieConsentStats.total",
  analyticsGranted: "cookieConsentStats.analyticsGranted",
  marketingGranted: "cookieConsentStats.marketingGranted",
} as const;

async function increment(key: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO site_settings (key, value, "updatedAt")
    VALUES (${key}, '1', now())
    ON CONFLICT (key)
    DO UPDATE SET value = (site_settings.value::int + 1)::text, "updatedAt" = now()
  `;
}

/** Called once per banner decision (accept all / reject all / save). */
export async function recordCookieConsentDecision(decision: {
  analytics: boolean;
  marketing: boolean;
}): Promise<void> {
  const writes = [increment(KEYS.total)];
  if (decision.analytics) writes.push(increment(KEYS.analyticsGranted));
  if (decision.marketing) writes.push(increment(KEYS.marketingGranted));

  // Best-effort: a stats write must never be the reason a consent decision
  // fails to save. safeQuery already logs; Promise.all here would reject
  // the whole batch if any one insert raced into a transient error.
  await Promise.all(writes.map((write) => write.catch(() => undefined)));
}

export type CookieConsentStats = {
  total: number;
  analyticsGranted: number;
  marketingGranted: number;
  /** 0-100, null when there are no decisions yet to compute a rate from. */
  analyticsRate: number | null;
  marketingRate: number | null;
};

export async function getCookieConsentStats(): Promise<CookieConsentStats> {
  const rows = await safeQuery(
    "report:cookieConsentStats",
    () =>
      prisma.siteSetting.findMany({
        where: { key: { in: Object.values(KEYS) } },
        select: { key: true, value: true },
      }),
    [] as { key: string; value: string }[],
  );

  const values = new Map(rows.map((row) => [row.key, Number.parseInt(row.value, 10) || 0]));

  const total = values.get(KEYS.total) ?? 0;
  const analyticsGranted = values.get(KEYS.analyticsGranted) ?? 0;
  const marketingGranted = values.get(KEYS.marketingGranted) ?? 0;

  return {
    total,
    analyticsGranted,
    marketingGranted,
    analyticsRate: total === 0 ? null : Math.round((analyticsGranted / total) * 1000) / 10,
    marketingRate: total === 0 ? null : Math.round((marketingGranted / total) * 1000) / 10,
  };
}

// Re-export for tests that need to assert against the raw key names without
// duplicating the string literals.
export const COOKIE_CONSENT_STAT_KEYS = KEYS;
