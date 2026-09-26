/**
 * lib/seo/alert-rules.ts
 * ─────────────────────────────────────────────────────────────────────────
 * When an alert should fire, decided on data already in hand.
 *
 * Separated from lib/seo/alerts.ts — which queries, de-duplicates and
 * emails — for the same reason lib/seo/rules/* is separate from the audit
 * runner: a threshold comparison is where an alert quietly becomes wrong,
 * and it is worth being able to test "51 hits fires, 50 does not" without
 * a database.
 *
 * THRESHOLDS LIVE HERE AND NOWHERE ELSE
 *
 * They are constants in this file rather than editable settings. What the
 * team asked to control is whether a rule speaks at all; a threshold that
 * can be edited in two places — the screen and the code — eventually shows
 * one number and applies another, and nobody finds out until an alert that
 * should have fired did not.
 *
 * TWO RULES CANNOT FIRE YET
 *
 * INDEX_DROP needs index coverage (phase 5) and CLICKS_DROP needs Search
 * Console (phase 4). They are defined here, listed on the settings card and
 * reported as waiting for Google rather than quietly absent — a rule nobody
 * can see is a rule everybody assumes is running.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { SeoAlertKind } from "@prisma/client";
import { rateVital, type VitalKey } from "@/lib/analytics/vitals";

export const ALERT_THRESHOLDS = {
  /** URLs that fell out of the index in one day. */
  indexDropUrls: 3,
  /** 404s against a single path in one day. */
  notFoundHitsPerPath: 50,
  /** How long after a deploy a vitals regression is still blamed on it. */
  vitalsWindowHours: 48,
  /** Percentage fall in search clicks against the week before. */
  clicksDropPercent: 25,
} as const;

/** Every rule, in the order the settings card lists them. */
export const ALERT_KINDS: SeoAlertKind[] = [
  "INDEX_DROP",
  "NOT_FOUND_SPIKE",
  "VITALS_REGRESSION",
  "CLICKS_DROP",
  "CRON_FAILED",
];

/** Rules whose data source does not exist in this deployment yet. */
export const ALERTS_AWAITING_GOOGLE: readonly SeoAlertKind[] = [
  "INDEX_DROP",
  "CLICKS_DROP",
];

export type AlertCandidate = {
  kind: SeoAlertKind;
  /** English, and stored verbatim. It carries the specifics — the path,
   *  the count, the metric — so an alert read six months later still says
   *  what happened rather than depending on a message file that has moved
   *  on since. The screens pair it with the rule's translated label. */
  message: string;
  payload: Record<string, unknown>;
};

/**
 * Paths that returned 404 more than the threshold allows in a single day.
 *
 * Strictly greater than, matching the wording ("more than fifty"): exactly
 * fifty does not fire. Worth pinning, because a rule that fires at the
 * round number people quote is a rule that fires one day early and gets
 * turned off.
 *
 * One alert per path rather than one summarising all of them: each is a
 * different broken link with a different fix, and a single "12 paths are
 * 404ing" tells nobody which to look at.
 */
export function notFoundSpikes(
  rows: readonly { path: string; hits: number; day: Date }[],
): AlertCandidate[] {
  return rows
    .filter((row) => row.hits > ALERT_THRESHOLDS.notFoundHitsPerPath)
    .sort((a, b) => b.hits - a.hits)
    .map((row) => ({
      kind: "NOT_FOUND_SPIKE" as const,
      message: `${row.path} returned 404 ${row.hits} times on ${row.day.toISOString().slice(0, 10)}`,
      payload: {
        path: row.path,
        hits: row.hits,
        day: row.day.toISOString().slice(0, 10),
        threshold: ALERT_THRESHOLDS.notFoundHitsPerPath,
      },
    }));
}

export type VitalsSnapshot = {
  metric: VitalKey;
  value: number;
  sampleCount: number;
};

/**
 * Metrics that were "good" before a deploy and are not after it.
 *
 * Only a crossing counts. A metric that was already poor and got slightly
 * worse does not fire — it is a known problem, and an alert that repeats a
 * known problem every night is an alert people filter into a folder. A
 * metric that was good and is now merely "needs improvement" does fire:
 * that is the moment a deploy cost something, and the moment it is cheapest
 * to look at the diff.
 *
 * Both sides must carry enough samples. Without that guard a deploy at a
 * quiet hour compares nine visits against the week before it and alerts on
 * noise, which is the fastest way to teach a team to ignore the alert.
 */
export function vitalsRegressions(
  before: readonly VitalsSnapshot[],
  after: readonly VitalsSnapshot[],
  minSamples: number,
  commitSha: string | null,
): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];

  for (const now of after) {
    const previous = before.find((row) => row.metric === now.metric);
    if (!previous) continue;

    if (now.sampleCount < minSamples || previous.sampleCount < minSamples)
      continue;

    const wasGood = rateVital(previous.metric, previous.value) === "good";
    const rating = rateVital(now.metric, now.value);
    if (!wasGood || rating === "good") continue;

    candidates.push({
      kind: "VITALS_REGRESSION",
      message:
        `${now.metric} left the "good" band after a deploy: ` +
        `${previous.value} → ${now.value} (now ${rating})`,
      payload: {
        metric: now.metric,
        before: previous.value,
        after: now.value,
        rating,
        commitSha,
        windowHours: ALERT_THRESHOLDS.vitalsWindowHours,
        samples: { before: previous.sampleCount, after: now.sampleCount },
      },
    });
  }

  return candidates;
}

/**
 * Whether a fall in clicks is steep enough to say something about.
 *
 * Exported and tested although nothing calls it yet: phase 4 brings the
 * clicks, and the rule the report's settings card already lists should
 * behave the way the card says when it does.
 *
 * A previous week of zero never fires. There is no percentage fall from
 * nothing, and dividing by it produces Infinity — which would render as an
 * alert claiming clicks fell by an infinite amount the first week after a
 * launch.
 */
export function clicksDropped(current: number, previous: number): boolean {
  if (previous <= 0) return false;

  const fall = ((previous - current) / previous) * 100;
  return fall > ALERT_THRESHOLDS.clicksDropPercent;
}

/** Whether an index drop is steep enough to say something about. */
export function indexDropped(lostUrls: number): boolean {
  return lostUrls > ALERT_THRESHOLDS.indexDropUrls;
}
