/**
 * lib/seo/alerts.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Checking the alert rules after a cron run, and saying something once.
 *
 * ONCE IS THE WHOLE DESIGN
 *
 * The rules watch conditions that persist: a broken link goes on 404ing
 * every day until somebody fixes it, and a slow deploy stays slow. A check
 * that fires on every cron run would send the same email nightly for a
 * fortnight, and the third one teaches the team to filter the address. So
 * an alert is suppressed when an alert with the same identity already fired
 * inside COOLDOWN_MS — identity being the rule *and* what it is about, so
 * two different broken paths still raise two alerts on the same night.
 *
 * WRITING COMES BEFORE SENDING
 *
 * The row is written first and the email sent afterwards. If the mail
 * server is down, the alert still exists on the SEO overview — which is
 * where somebody looks when they suspect they have stopped receiving
 * email. Sending first and writing afterwards loses the alert entirely on
 * a crash between the two.
 *
 * NOT WRAPPED IN safeQuery. This runs from a scheduled job, and a database
 * that is down should be a loud failure the scheduler retries, not a
 * cheerful "no alerts today".
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { PathHitKind, type SeoAlertKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { reportRecipients, sendReportEmail, escapeHtml } from "@/lib/email";
import { MIN_SAMPLES, type VitalKey } from "@/lib/analytics/vitals";
import {
  ALERT_KINDS,
  ALERT_THRESHOLDS,
  notFoundSpikes,
  vitalsRegressions,
  type AlertCandidate,
  type VitalsSnapshot,
} from "@/lib/seo/alert-rules";

/**
 * How long the same alert stays quiet after firing.
 *
 * A day, matching the cadence of the jobs that trigger these checks: a
 * condition that is still true tomorrow is worth one more mention, and one
 * that clears in between simply stops being reported.
 */
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** What makes two alerts "the same alert" for suppression. */
function identityOf(candidate: AlertCandidate): string {
  const payload = candidate.payload;

  if (candidate.kind === "NOT_FOUND_SPIKE")
    return `NOT_FOUND_SPIKE:${payload.path}`;
  if (candidate.kind === "VITALS_REGRESSION")
    return `VITALS_REGRESSION:${payload.metric}`;
  if (candidate.kind === "CRON_FAILED") return `CRON_FAILED:${payload.job}`;

  return candidate.kind;
}

/**
 * Which rules are on.
 *
 * A rule with no row is on. The table records departures from the default
 * rather than the default itself, so a rule added in a later phase starts
 * working without a migration that backfills rows for it — and a rule
 * somebody turned off stays off.
 */
export async function getAlertRules(): Promise<Record<SeoAlertKind, boolean>> {
  const rows = await safeQuery(
    "alerts:rules",
    () =>
      prisma.seoAlertRule.findMany({ select: { kind: true, enabled: true } }),
    [] as { kind: SeoAlertKind; enabled: boolean }[],
  );

  const byKind = new Map(rows.map((row) => [row.kind, row.enabled]));
  const result = {} as Record<SeoAlertKind, boolean>;

  for (const kind of ALERT_KINDS) result[kind] = byKind.get(kind) ?? true;

  return result;
}

export async function setAlertRule(
  kind: SeoAlertKind,
  enabled: boolean,
): Promise<void> {
  await prisma.seoAlertRule.upsert({
    where: { kind },
    create: { kind, enabled },
    update: { enabled },
  });
}

export type AlertRow = {
  id: string;
  kind: SeoAlertKind;
  message: string;
  createdAt: Date;
};

/** The SEO overview's "recent alerts" card. */
export async function getRecentAlerts(
  days = 7,
  take = 10,
): Promise<AlertRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return safeQuery(
    "alerts:recent",
    () =>
      prisma.seoAlert.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, kind: true, message: true, createdAt: true },
      }),
    [] as AlertRow[],
  );
}

/**
 * Record a scheduled job's failure as an alert.
 *
 * Called from the cron routes' own catch blocks, which is the only place
 * that knows a run failed: nothing else can tell "the job errored" from
 * "the job has not been triggered yet", and before this existed the two
 * looked identical on every screen.
 */
export async function recordCronFailure(
  job: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await fire([
    {
      kind: "CRON_FAILED",
      message: `The ${job} job failed: ${message}`,
      payload: { job, error: message },
    },
  ]);
}

export type AlertCheckResult = {
  /** Conditions that were true. */
  found: number;
  /** Alerts actually written and sent — the rest were suppressed or off. */
  fired: number;
  suppressed: number;
  disabled: number;
};

/**
 * Run every enabled rule that has data, then fire what is new.
 *
 * Called after each cron run rather than on its own schedule: the rules
 * read what those jobs just wrote, so checking at any other moment either
 * repeats yesterday's answer or races the write.
 */
export async function runAlertChecks(
  now: Date = new Date(),
): Promise<AlertCheckResult> {
  const rules = await getAlertRules();

  const candidates: AlertCandidate[] = [];
  let disabled = 0;

  if (rules.NOT_FOUND_SPIKE) candidates.push(...(await checkNotFound(now)));
  else disabled += 1;

  if (rules.VITALS_REGRESSION) candidates.push(...(await checkVitals(now)));
  else disabled += 1;

  // INDEX_DROP and CLICKS_DROP have no data source until phases 4 and 5.
  // Not silently skipped — the settings card shows them as waiting for
  // Google, so nobody believes they are running.

  const { fired, suppressed } = await fire(candidates, now);

  return { found: candidates.length, fired, suppressed, disabled };
}

/** 404s in the last full day, per path. */
async function checkNotFound(now: Date): Promise<AlertCandidate[]> {
  const day = startOfUtcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const rows = await prisma.pathHitDay.findMany({
    where: { kind: PathHitKind.NOT_FOUND, day: { gte: day } },
    select: { path: true, hits: true, day: true },
  });

  return notFoundSpikes(rows);
}

/**
 * Core Web Vitals either side of the most recent deploy.
 *
 * "The deploy" is the newest commit sha the beacon has seen. Before is
 * every rollup older than it, after is everything since — within the
 * window the rule allows, so a regression noticed a week later is not
 * still blamed on a deploy from last Tuesday.
 */
async function checkVitals(now: Date): Promise<AlertCandidate[]> {
  const windowMs = ALERT_THRESHOLDS.vitalsWindowHours * 60 * 60 * 1000;

  const latestDeploy = await prisma.webVital.findFirst({
    where: {
      commitSha: { not: null },
      createdAt: { gte: new Date(now.getTime() - windowMs) },
    },
    orderBy: { createdAt: "desc" },
    select: { commitSha: true, createdAt: true },
  });

  // No deploy inside the window: nothing to attribute a change to, and
  // this rule is specifically about deploys.
  if (!latestDeploy) return [];

  const [before, after] = await Promise.all([
    snapshot({ lt: latestDeploy.createdAt }),
    snapshot({ gte: latestDeploy.createdAt }),
  ]);

  return vitalsRegressions(before, after, MIN_SAMPLES, latestDeploy.commitSha);
}

async function snapshot(day: {
  lt?: Date;
  gte?: Date;
}): Promise<VitalsSnapshot[]> {
  const rollups = await prisma.vitalDailyRollup.findMany({
    where: { day },
    select: { metric: true, p75: true, sampleCount: true },
  });

  const metrics: VitalKey[] = ["LCP", "INP", "CLS", "TTFB"];

  return metrics.map((metric) => {
    const rows = rollups.filter((row) => row.metric === metric);

    let weighted = 0;
    let samples = 0;
    for (const row of rows) {
      weighted += row.p75 * row.sampleCount;
      samples += row.sampleCount;
    }

    return {
      metric,
      value: samples === 0 ? 0 : Math.round(weighted / samples),
      sampleCount: samples,
    };
  });
}

/** Write the new alerts, then email them. See the header on the order. */
async function fire(
  candidates: readonly AlertCandidate[],
  now: Date = new Date(),
): Promise<{ fired: number; suppressed: number }> {
  if (candidates.length === 0) return { fired: 0, suppressed: 0 };

  const since = new Date(now.getTime() - COOLDOWN_MS);
  const recent = await prisma.seoAlert.findMany({
    where: { createdAt: { gte: since } },
    select: { kind: true, payload: true },
  });

  const alreadySaid = new Set(
    recent.map((row) =>
      identityOf({
        kind: row.kind,
        message: "",
        payload: (row.payload ?? {}) as Record<string, unknown>,
      }),
    ),
  );

  const fresh = candidates.filter(
    (candidate) => !alreadySaid.has(identityOf(candidate)),
  );
  if (fresh.length === 0) return { fired: 0, suppressed: candidates.length };

  await prisma.seoAlert.createMany({
    data: fresh.map((candidate) => ({
      kind: candidate.kind,
      message: candidate.message,
      payload: candidate.payload as object,
    })),
  });

  await email(fresh);

  return { fired: fresh.length, suppressed: candidates.length - fresh.length };
}

async function email(alerts: readonly AlertCandidate[]): Promise<void> {
  const to = reportRecipients();
  if (to.length === 0) return;

  const subject =
    alerts.length === 1
      ? `SEO alert: ${alerts[0].message}`
      : `${alerts.length} SEO alerts`;

  const html =
    "<h2>SEO alerts</h2><ul>" +
    alerts.map((alert) => `<li>${escapeHtml(alert.message)}</li>`).join("") +
    "</ul>";

  const text = alerts.map((alert) => `- ${alert.message}`).join("\n");

  const result = await sendReportEmail({ to, subject, html, text });

  if (!result.ok) {
    // Logged rather than thrown: the alert rows are already written, which
    // is the durable half, and failing the cron run here would make the
    // scheduler retry checks that would then be suppressed as duplicates.
    console.error("[alerts] could not email", result.error);
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
