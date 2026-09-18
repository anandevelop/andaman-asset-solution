import "server-only";

/**
 * lib/admin/system-health.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "สถานะการเชื่อมต่อ" — the seven services this application depends on, and
 * what is actually true about each one right now.
 *
 * EVERY LINE IS EITHER A CONFIGURATION FACT OR A COUNTED NUMBER
 *
 * A status panel is worth having only if it would tell you when something
 * is wrong, so nothing here is asserted from a config file alone where a
 * real figure exists, and nothing is invented where one does not:
 *
 *  · Configured / not configured comes from the environment and the
 *    settings table. Checkable, and the thing that is wrong most often.
 *  · Storage used is the sum of what the media library uploaded. Real, and
 *    labelled as what it is — files put there by another route are not in
 *    it, and the panel says so rather than implying it read the bucket.
 *  · Spam blocked and cookie acceptance are counters this application
 *    writes itself.
 *  · Sentry's error count and Google's traffic figures are NOT here. Both
 *    need an API and an OAuth connection nobody has set up, and a
 *    plausible-looking number beside real ones makes the real ones
 *    untrustworthy. Those rows link out to the tool that does know.
 *
 * THE REDIS ROW IS THE POINT OF THE PANEL
 *
 * There is no Redis, no queue and no scheduler. Three consequences follow
 * and all three are stated: rate limits are per-process, a failed
 * notification is never retried, and the three time-based notifications on
 * the settings screen cannot be switched on. See lib/notifications.ts and
 * lib/rate-limit.ts, which say the same thing from their own end.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PathHitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { hitDay } from "@/lib/redirects";
import { isEmailConfigured } from "@/lib/email";
import { isSentryEnabled } from "@/lib/sentry";
import { getSiteSettings } from "@/lib/settings";

/** The window the spam figure is summed over. */
export const SPAM_WINDOW_DAYS = 7;

export type HealthState =
  /** Configured and doing its job. */
  | "ok"
  /** Configured, but with something worth looking at. */
  | "attention"
  /** Not configured at all. */
  | "off";

export type HealthRow = {
  key: string;
  state: HealthState;
  /** i18n key suffix for the one-line detail under the name. */
  detailKey: string;
  /** Values the detail line interpolates. Always real. */
  detailValues?: Record<string, string | number>;
  /** An external console this row's real numbers live in, when one exists. */
  externalHref?: string;
  /** The environment variable that would switch this on, for an "off" row. */
  envVar?: string;
};

export type SystemHealth = {
  rows: HealthRow[];
  /** Bytes the media library has uploaded. */
  storageBytes: number;
  databaseOffline: boolean;
};

/** GB with one decimal — the unit a person reading a storage line wants. */
export function formatGigabytes(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

/** Sum of FORM_REJECTED day rows inside the window. */
async function spamBlocked(): Promise<number> {
  const since = hitDay(new Date(Date.now() - SPAM_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  const result = await prisma.pathHitDay.aggregate({
    where: { kind: PathHitKind.FORM_REJECTED, day: { gte: since } },
    _sum: { hits: true },
  });

  return result._sum.hits ?? 0;
}

/**
 * The Sentry project's own URL, built from the two variables the release
 * step already needs. Without them the row still renders — it just has
 * nothing to link to, which is the truth.
 */
function sentryProjectUrl(): string | undefined {
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  return org && project ? `https://sentry.io/organizations/${org}/projects/${project}/` : undefined;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const databaseOffline = isDatabaseOffline();

  const [storage, blocked, settings] = await Promise.all([
    safeQuery(
      "health:storage",
      () => prisma.media.aggregate({ _sum: { sizeBytes: true } }),
      { _sum: { sizeBytes: null } },
    ),
    safeQuery("health:spam", spamBlocked, 0),
    getSiteSettings(),
  ]);

  const storageBytes = storage._sum.sizeBytes ?? 0;

  const emailOn = isEmailConfigured();
  const recaptchaOn = Boolean(
    process.env.RECAPTCHA_SECRET_KEY && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
  );
  const gaId = settings.analytics.gaMeasurementId || process.env.NEXT_PUBLIC_GA_ID || "";
  const searchConsole = settings.analytics.googleSiteVerification;
  const spacesOn = Boolean(process.env.DO_SPACES_BUCKET && process.env.DO_SPACES_ACCESS_KEY_ID);

  const rows: HealthRow[] = [
    {
      key: "email",
      state: emailOn ? "ok" : "off",
      detailKey: emailOn ? "emailOn" : "emailOff",
      detailValues: emailOn ? { host: process.env.SMTP_HOST ?? "" } : undefined,
      envVar: emailOn ? undefined : "SMTP_HOST",
    },
    {
      key: "storage",
      state: spacesOn ? "ok" : "off",
      detailKey: spacesOn ? "storageOn" : "storageOff",
      detailValues: spacesOn ? { gb: formatGigabytes(storageBytes) } : undefined,
      envVar: spacesOn ? undefined : "DO_SPACES_BUCKET",
    },
    {
      key: "analytics",
      state: gaId ? "ok" : "off",
      detailKey: gaId ? "analyticsOn" : "analyticsOff",
      detailValues: gaId ? { id: gaId } : undefined,
      externalHref: gaId ? "https://analytics.google.com/" : undefined,
    },
    {
      key: "searchConsole",
      state: searchConsole ? "ok" : "off",
      detailKey: searchConsole ? "searchConsoleOn" : "searchConsoleOff",
      externalHref: "https://search.google.com/search-console",
    },
    {
      key: "recaptcha",
      state: recaptchaOn ? "ok" : "off",
      detailKey: recaptchaOn ? "recaptchaOn" : "recaptchaOff",
      detailValues: recaptchaOn ? { count: blocked, days: SPAM_WINDOW_DAYS } : undefined,
      envVar: recaptchaOn ? undefined : "RECAPTCHA_SECRET_KEY",
    },
    {
      key: "sentry",
      state: isSentryEnabled ? "ok" : "off",
      detailKey: isSentryEnabled ? "sentryOn" : "sentryOff",
      externalHref: isSentryEnabled ? sentryProjectUrl() : undefined,
      envVar: isSentryEnabled ? undefined : "SENTRY_DSN",
    },
    {
      /*
        Always "off", because it always is — there is no Redis in this
        deployment and no code path that would use one. Kept on the panel
        rather than omitted: the two things it costs (per-process rate
        limits, notifications that are never retried) are worth knowing,
        and they are the reason three switches on the notifications tab
        cannot be turned on.
      */
      key: "queue",
      state: "off",
      detailKey: "queueOff",
      envVar: "REDIS_URL",
    },
  ];

  return { rows, storageBytes, databaseOffline };
}
