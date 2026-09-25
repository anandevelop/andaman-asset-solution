/**
 * tests/seo/score.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turning fifteen verdicts into one number.
 *
 * The arithmetic is three lines and the interesting part is what is left
 * out of it. A skipped rule and a waived rule both leave the denominator,
 * for different reasons that both come down to the same failure: if either
 * counted as a pass, the score would go up for reasons that are not
 * improvements — a page nobody could fetch would outscore one that was
 * checked and found good, and waiving a rule would become a way to raise a
 * number rather than to stop asking a question.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { auditUrl, scoreOutcomes, summariseRun, type RuleOutcome } from "@/lib/seo/score";
import { SEO_RULES } from "@/lib/seo/rules";
import type { SeoRuleInput } from "@/lib/seo/types";

function outcome(over: Partial<RuleOutcome> & Pick<RuleOutcome, "key" | "weight">): RuleOutcome {
  return { severity: "warning", result: { status: "pass" }, waived: false, ...over };
}

/** A page that passes everything — the same fixture shape the rule tests
 *  use, kept here so this file can run the real rule set end to end. */
function healthyInput(overrides: Partial<SeoRuleInput> = {}): SeoRuleInput {
  return {
    url: "/th/projects/victory",
    locale: "th",
    slug: "victory",
    title: "The Victory",
    metaDescription: "Eleven pool villas on the last ridge plot in Laguna.",
    noIndex: false,
    ogImageUrl: "https://media.example.com/victory.jpg",
    localeCount: 4,
    siteLocaleCount: 4,
    duplicates: { title: 1, metaDescription: 1 },
    siteIndexable: true,
    rendered: {
      canonical: "https://andamanassetsolution.com/th/projects/victory",
      hreflang: ["en", "th", "zh", "ru"],
      h1Count: 1,
      jsonLdTypes: ["RealEstateListing"],
      metaRobots: "index, follow",
      imageCount: 3,
      imagesMissingAlt: 0,
      wordCount: 900,
    },
    brokenInternalLinks: 0,
    ...overrides,
  };
}

describe("auditUrl — against the real rule set", () => {
  it("scores a healthy page 100 with nothing failed", () => {
    const result = auditUrl(healthyInput());

    expect(result.score).toBe(100);
    expect(result.failedRules).toEqual([]);
    expect(result.checkedWeight).toBe(100);
  });

  it("subtracts exactly the failing rule's weight", () => {
    const result = auditUrl(healthyInput({ metaDescription: "" }));

    expect(result.failedRules).toEqual(["meta-description"]);
    // 12 lost out of a denominator of 95, not 100: an empty description
    // also makes duplicate-meta-description skip, which is the point of
    // that skip — the same gap must not be counted by two rules.
    expect(result.checkedWeight).toBe(95);
    expect(result.score).toBe(Math.round(((95 - 12) / 95) * 100));
  });

  it("reports failures in the rule set's own order", () => {
    const result = auditUrl(
      healthyInput({ metaDescription: "", ogImageUrl: null, slug: "a".repeat(90) }),
    );
    // Heaviest first, matching the table.
    expect(result.failedRules).toEqual(["meta-description", "og-image", "slug-length"]);
  });
});

describe("a page that could not be fetched", () => {
  const unfetched = healthyInput({ rendered: null, brokenInternalLinks: null });

  it("is scored out of what could be checked, not out of 100", () => {
    const result = auditUrl(unfetched);

    // Six rules need the rendered page and one needs the link scan; the
    // rest can still be judged from the row.
    expect(result.checkedWeight).toBeLessThan(100);
    expect(result.checkedWeight).toBeGreaterThan(0);
  });

  it("does not score better than a page that was checked and found good", () => {
    // The failure this guards: counting a skip as a pass makes the pages
    // nobody could reach the healthiest on the site.
    const checkedButFlawed = auditUrl(healthyInput({ metaDescription: "" }));
    const notChecked = auditUrl(healthyInput({ rendered: null, brokenInternalLinks: null, metaDescription: "" }));

    expect(notChecked.score).toBeLessThanOrEqual(100);
    expect(notChecked.failedRules).toContain("meta-description");
    expect(checkedButFlawed.score).toBeLessThan(100);
  });

  it("says nothing was checked rather than reporting a score of zero", () => {
    const result = scoreOutcomes([
      outcome({ key: "a", weight: 50, result: { status: "skip", reason: "no page" } }),
      outcome({ key: "b", weight: 50, result: { status: "skip", reason: "no page" } }),
    ]);

    expect(result.checkedWeight).toBe(0);
    // 100, not 0: there is no evidence against it, and a wall of zeroes for
    // unfetchable pages buries the pages that are genuinely bad.
    expect(result.score).toBe(100);
  });
});

describe("waivers", () => {
  it("stops a waived failure counting against the score", () => {
    const waived = auditUrl(healthyInput({ metaDescription: "" }), new Set(["meta-description"]));

    expect(waived.score).toBe(100);
    expect(waived.failedRules).toEqual([]);
  });

  it("still records it as waived, so the row is not silently clean", () => {
    const waived = auditUrl(healthyInput({ metaDescription: "" }), new Set(["meta-description"]));
    expect(waived.waivedRules).toEqual(["meta-description"]);
  });

  it("removes the rule from the denominator rather than passing it", () => {
    // If a waiver counted as a pass it would be a way to raise the number,
    // and the first person to notice would stop trusting every waiver.
    const waived = auditUrl(healthyInput({ metaDescription: "" }), new Set(["meta-description"]));
    // 12 for the waiver, and 5 more because duplicate-meta-description
    // skips an empty description rather than double-counting the gap.
    expect(waived.checkedWeight).toBe(100 - 12 - 5);
  });

  it("does not credit a waiver for a rule that was passing anyway", () => {
    const waived = auditUrl(healthyInput(), new Set(["meta-description"]));

    expect(waived.waivedRules).toEqual([]);
    expect(waived.checkedWeight).toBe(100 - 12);
    expect(waived.score).toBe(100);
  });

  it("ignores a waiver for a rule that no longer exists", () => {
    const result = auditUrl(healthyInput(), new Set(["a-rule-we-deleted"]));
    expect(result.score).toBe(100);
    expect(result.checkedWeight).toBe(100);
  });
});

describe("summariseRun — what SeoAuditRun stores", () => {
  it("counts URLs, averages the score and tallies each rule", () => {
    const scores = [
      auditUrl(healthyInput()),
      auditUrl(healthyInput({ metaDescription: "" })),
      auditUrl(healthyInput({ metaDescription: "", ogImageUrl: null })),
    ];

    const summary = summariseRun(scores);

    expect(summary.urlCount).toBe(3);
    expect(summary.passAllCount).toBe(1);
    expect(summary.failCountByRule["meta-description"]).toBe(2);
    expect(summary.failCountByRule["og-image"]).toBe(1);
    const [healthy, noDescription, noDescriptionNoImage] = scores;
    expect(summary.avgScore).toBe(
      Math.round((healthy.score + noDescription.score + noDescriptionNoImage.score) / 3),
    );
  });

  it("does not count a waived failure as a failure for the run", () => {
    const scores = [auditUrl(healthyInput({ metaDescription: "" }), new Set(["meta-description"]))];
    const summary = summariseRun(scores);

    expect(summary.failCountByRule["meta-description"]).toBeUndefined();
    expect(summary.passAllCount).toBe(1);
  });

  it("handles a run with no URLs", () => {
    expect(summariseRun([])).toMatchObject({ urlCount: 0, avgScore: 0, passAllCount: 0 });
  });
});

describe("the arithmetic on its own", () => {
  it("is the share of checked weight that passed", () => {
    const result = scoreOutcomes([
      outcome({ key: "a", weight: 30, result: { status: "fail" } }),
      outcome({ key: "b", weight: 70 }),
    ]);
    expect(result.score).toBe(70);
  });

  it("rounds to a whole number, because the graph plots whole numbers", () => {
    const result = scoreOutcomes([
      outcome({ key: "a", weight: 1, result: { status: "fail" } }),
      outcome({ key: "b", weight: 2 }),
    ]);
    expect(result.score).toBe(67);
  });

  it("never returns a score outside 0–100", () => {
    const allFailed = SEO_RULES.map((rule) =>
      outcome({ key: rule.key, weight: rule.weight, result: { status: "fail" } }),
    );
    expect(scoreOutcomes(allFailed).score).toBe(0);
  });
});
