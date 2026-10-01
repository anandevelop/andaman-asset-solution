/**
 * tests/admin/dashboard-reports.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One home for the reports.
 *
 * /admin and /admin/analytics drew the same four charts from the same
 * lib/reports.ts functions, over windows that could differ — the
 * dashboard's followed `?range=`, the analytics page's was pinned at 12
 * months — so the two screens answered one question twice and could be
 * read as contradicting each other. Three more reports existed only on the
 * dashboard, which made the reports screen the incomplete one.
 *
 * Both halves are checked here, because only fixing one of them recreates
 * the problem in the other direction: a report deleted from the dashboard
 * and not landed on /admin/analytics is not deduplicated, it is gone.
 *
 * Read from source rather than rendered: both pages are async Server
 * Components that open a database connection on their first line, so
 * grepping them is the cheap check — the same reasoning as
 * tests/breadcrumbs.test.ts and tests/admin/permissions-nav.test.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/* Comments out first, same as tests/admin/permissions-nav.test.ts. Both
   files explain this move in their headers and name the very things
   checked for below, so a grep over the raw text would be reading the
   story about the code rather than the code. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (...parts: string[]) => stripComments(readFileSync(join(ROOT, ...parts), "utf8"));

const dashboard = read("app", "[locale]", "admin", "page.tsx");
const analytics = read("app", "[locale]", "admin", "(growth)", "analytics", "page.tsx");

/**
 * Every aggregate report the back office draws, by the function that
 * produces it. Adding a report means adding it here, which is the point:
 * the list is what makes "it has to be on exactly one screen" checkable.
 */
const REPORT_QUERIES = [
  "getMonthlyLeads",
  "getLeadsBySource",
  "getProjectConversions",
  "getLeadPipeline",
  "getEventRsvpSummary",
  "getCookieConsentStats",
  "getWeekOverWeekLeads",
  "getPageViewTrend",
] as const;

/**
 * Reports the dashboard may quote as one headline number on a KPI card.
 *
 * Not a report drawn twice: a single figure that links to the chart, read
 * through the very function the chart uses, so the two screens cannot
 * disagree about it. The v4 dashboard's page-view and consent cards are
 * exactly this, and a card that queried the same table its own way would
 * be the drift this file exists to prevent.
 */
const HEADLINE_QUERIES = ["getPageViewTrend", "getCookieConsentStats"] as const;

describe("the dashboard", () => {
  it("draws no report of its own", () => {
    const drawn = REPORT_QUERIES.filter(
      (query) => dashboard.includes(query) && !(HEADLINE_QUERIES as readonly string[]).includes(query),
    );

    expect(drawn, "these belong on /admin/analytics, not the dashboard").toEqual([]);
  });

  it("keeps the work queue", () => {
    // What the page is *for*, as opposed to what it stopped being. A
    // dashboard trimmed all the way to a greeting would pass the check
    // above and be useless.
    for (const query of ["getUnassignedLeads", "getOverdueAppointments", "getTodayEvents", "WorkInbox"]) {
      expect(dashboard, query).toContain(query);
    }
  });

  it("gates what it links to on the nav item's own rule", () => {
    /* A role list written out beside the link is how the "Mobile view"
       defect happened — see lib/admin/nav.ts's header. canSeeItem() asks
       the real item, so the link and the destination cannot drift. */
    expect(dashboard).toContain('canSeeItem(session.role, "analytics")');
  });

  it("no longer carries the range picker", () => {
    // It scoped reports. There are none here to scope, and leaving it
    // would put a control on screen that changes nothing on it.
    expect(dashboard).not.toContain("DashboardControls");
  });
});

describe("/admin/analytics", () => {
  it("draws every report", () => {
    const missing = REPORT_QUERIES.filter((query) => !analytics.includes(query));

    expect(missing, "a report dropped from the dashboard has to land here").toEqual([]);
  });

  it("took the range picker and honours the parameter it sets", () => {
    expect(analytics).toContain("DashboardControls");
    expect(analytics).toContain("isRangeDays(searchParams.range)");

    // And actually applies it — a picker whose value nothing reads is the
    // same dead control, just moved.
    expect(analytics).toContain("getLeadsBySource(rangeMonths)");
    expect(analytics).toContain("getProjectConversions(locale, rangeMonths)");
  });
});
