import "server-only";

/**
 * lib/admin/system-health.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "สถานะการเชื่อมต่อ" — the six services this application depends on, and
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
 *  · Google's traffic figures are NOT here. They need an API and an OAuth
 *    connection, and a plausible-looking number beside real ones makes the
 *    real ones untrustworthy. That row links out to the tool that knows.
 *  · Errors are this application's own count (lib/system-errors.ts): the
 *    distinct failures seen in the last 24 hours.
 *
 * NO REDIS ROW
 *
 * There is no Redis and no code that would use one, so a row naming a
 * variable that changes nothing was removed. What its absence costs is
 * unchanged and said where it applies: rate limits are per-process
 * (lib/rate-limit.ts) and a failed notification is not retried
 * (lib/notifications.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PathHitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { hitDay } from "@/lib/redirects";
import { isEmailConfigured } from "@/lib/email";
import { isLineConfigured } from "@/lib/line";
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

export async function getSystemHealth(): Promise<SystemHealth> {
  const databaseOffline = isDatabaseOffline();

  const [storage, blocked, settings, lineOn, errorsToday] = await Promise.all([
    safeQuery(
      "health:storage",
      () => prisma.media.aggregate({ _sum: { sizeBytes: true } }),
      { _sum: { sizeBytes: null } },
    ),
    safeQuery("health:spam", spamBlocked, 0),
    getSiteSettings(),
    isLineConfigured().catch(() => false),
    safeQuery(
      "health:errors",
      () => prisma.systemError.count({ where: { lastSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      0,
    ),
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
      /*
        The site's own error log (lib/system-errors.ts), which tells the
        team on LINE. Amber while anything failed in the last day; grey
        when LINE is not connected, because then nobody is told.
      */
      key: "errors",
      state: !lineOn ? "off" : errorsToday > 0 ? "attention" : "ok",
      detailKey: !lineOn ? "errorsNoLine" : errorsToday > 0 ? "errorsSome" : "errorsOk",
      detailValues: errorsToday > 0 ? { count: errorsToday } : undefined,
    },
  ];

  return { rows, storageBytes, databaseOffline };
}
