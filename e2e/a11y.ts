/**
 * e2e/a11y.ts
 * ─────────────────────────────────────────────────────────────────────────
 * axe-core, wired into Playwright.
 *
 * Automated scanning catches roughly a third of WCAG failures — the
 * mechanical third: missing names, unlabelled controls, insufficient
 * contrast, broken heading order. It cannot tell you whether the focus
 * order makes sense or whether alt text is honest. It is a floor, not a
 * certificate, and docs/TESTING.md says so at more length.
 *
 * Scans are attached to the journeys rather than kept in a separate
 * "accessibility spec". A page in its default state is the easy case; the
 * states worth scanning are the ones only a journey reaches — a form
 * showing validation errors, a mobile menu that is open, a filtered list
 * that has just re-rendered.
 * ─────────────────────────────────────────────────────────────────────────
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** WCAG 2.1 A and AA — what the launch checklist commits to. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Options = {
  /** Limit the scan, e.g. to a form that has just failed validation. */
  include?: string;
  /**
   * Rules to switch off, each with a reason.
   *
   * Kept as a required comment rather than a bare array so a disabled rule
   * has to be justified in the diff. An undocumented exclusion is how a
   * suite ends up passing while the site regresses.
   */
  disableRules?: Record<string, string>;
};

export async function expectNoA11yViolations(page: Page, options: Options = {}) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);

  if (options.include) builder = builder.include(options.include);
  if (options.disableRules) builder = builder.disableRules(Object.keys(options.disableRules));

  const results = await builder.analyze();

  /*
    Format the failures before asserting.

    axe's raw result object is several hundred lines of JSON per violation,
    and Playwright truncates it — so the default failure message tells you
    something is wrong without telling you what or where. This prints the
    rule, the impact, the selector and the fix.
  */
  const report = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      selector: node.target.join(" "),
      failure: node.failureSummary?.replace(/\s+/g, " ").trim(),
    })),
  }));

  expect(
    report,
    report.length > 0
      ? `axe found ${report.length} violation(s):\n${JSON.stringify(report, null, 2)}`
      : undefined,
  ).toEqual([]);
}
