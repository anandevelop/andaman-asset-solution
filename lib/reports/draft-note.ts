/**
 * lib/reports/draft-note.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The first draft of "what we should do this month".
 *
 * WHY IT IS STRUCTURED AND NOT PROSE
 *
 * Returning sentences would mean writing them in four languages inside a
 * .ts file, where tests/i18n.test.ts cannot see them and a missing Russian
 * string surfaces as English text in a Russian report rather than as a
 * failing test. So this returns *what to say*, the message files say it,
 * and the editor on the reports page turns the result into text the team
 * can rewrite freely before sending.
 *
 * WHY IT IS DELIBERATELY SHORT
 *
 * Three items, worst first. A generated list of eleven suggestions is read
 * as noise and replaced wholesale; three that are visibly true are read and
 * edited. The point of the draft is to stop the note being empty on the 1st
 * of the month, not to write the report for anybody.
 *
 * Nothing here invents a recommendation from a number the deployment does
 * not have. While Search Console is missing, the draft says so as its own
 * item instead of quietly producing a shorter list that reads as "nothing
 * to do".
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReportData } from "@/lib/reports/seo-report";
import { displayValue, type VitalKey } from "@/lib/analytics/vitals";

export type DraftItem =
  /** The audit rule failing on the most URLs. */
  | { key: "auditIssue"; rule: string; count: number }
  /** A Core Web Vital outside the "good" band. */
  | { key: "vitalsPoor"; metric: VitalKey; value: string }
  /** The development that earned the most leads from search. */
  | { key: "topProject"; project: string; leads: number }
  /** A development that got leads, but none from search. */
  | { key: "noGoogleLeads"; project: string }
  /** Phase 4 is not connected, so half the picture is missing. */
  | { key: "notConnected" };

/** At most this many items — see the header. */
const MAX_ITEMS = 3;

export function draftNote(data: ReportData): DraftItem[] {
  const items: DraftItem[] = [];

  const worstVital = data.vitals
    .filter((vital) => vital.enoughSamples && vital.rating !== "good")
    // Poor before needs-improvement: one of these is costing rankings now.
    .sort(
      (a, b) => (a.rating === "poor" ? -1 : 0) - (b.rating === "poor" ? -1 : 0),
    )[0];

  if (worstVital) {
    items.push({
      key: "vitalsPoor",
      metric: worstVital.metric,
      value: formatVital(
        worstVital.metric,
        displayValue(worstVital.metric, worstVital.value),
      ),
    });
  }

  const topIssue = data.topIssues[0];
  if (topIssue && topIssue.urlCount > 0) {
    items.push({
      key: "auditIssue",
      rule: topIssue.rule,
      count: topIssue.urlCount,
    });
  }

  const best = data.rows.find((row) => row.googleLeads > 0);
  if (best) {
    items.push({
      key: "topProject",
      project: best.name,
      leads: best.googleLeads,
    });
  } else {
    /*
      No lead in the whole period landed from a search result. That is
      either a real problem or — far more likely early on — the fact that
      landing capture has only just started. Only worth writing down when
      there were leads at all; with no leads of any kind the site has a
      different problem and this sentence would be a distraction.
    */
    const withLeads = data.rows.find((row) => row.allLeads > 0);
    if (withLeads)
      items.push({ key: "noGoogleLeads", project: withLeads.name });
  }

  if (!data.search.available && items.length < MAX_ITEMS)
    items.push({ key: "notConnected" });

  return items.slice(0, MAX_ITEMS);
}

/** Same units the report prints: seconds for LCP, milliseconds for the
 *  other two timings, unitless for CLS. */
function formatVital(metric: VitalKey, value: number): string {
  if (metric === "CLS") return value.toFixed(2);
  if (metric === "LCP") return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}
