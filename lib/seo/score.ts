/**
 * lib/seo/score.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One URL's rules in, one 0–100 score and a list of what failed out.
 *
 * WHY SKIPPED RULES LEAVE THE DENOMINATOR
 *
 * The naive version is "100 minus the weight of everything that failed",
 * and it is wrong in the direction that hides problems. A page that could
 * not be fetched skips six rules; counting those as passes scores it 100
 * out of 100 for the checks nobody could run, so the pages the crawler
 * could not reach come out looking like the healthiest on the site.
 *
 * So the score is out of what could actually be checked: the weights of the
 * rules that returned a verdict. A URL where only meta-description and
 * og-image could be judged is scored out of 17, and `checkedWeight` says so
 * — the UI needs it to distinguish "93, and we checked everything" from
 * "93, and we checked a sixth of it".
 *
 * WHY A WAIVER IS NOT A PASS EITHER
 *
 * A waived rule leaves the denominator the same way a skipped one does, so
 * waiving thin-content on the privacy policy does not *raise* its score by
 * pretending it passed — it stops the question being asked. Otherwise
 * waivers would be a way to inflate the number, and the first person to
 * notice would stop trusting all of them.
 *
 * A URL with nothing checkable scores 100 rather than 0: there is no
 * evidence against it, and a wall of zeroes for pages nobody could fetch
 * would bury the pages that are genuinely bad. `checkedWeight: 0` is the
 * honest signal, and the caller shows it as "not checked" rather than as a
 * score.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { SEO_RULES } from "@/lib/seo/rules";
import type { SeoRule, SeoRuleInput, SeoRuleResult } from "@/lib/seo/types";

export type RuleOutcome = {
  key: string;
  severity: SeoRule["severity"];
  weight: number;
  result: SeoRuleResult;
  /** True when a SeoRuleWaiver covers this URL and rule. */
  waived: boolean;
};

export type UrlScore = {
  /** 0–100, out of the weight that could actually be judged. */
  score: number;
  /** Keys of the rules that failed and were not waived — this is what goes
   *  into SeoUrlState.failedRules. */
  failedRules: string[];
  /** Keys that failed but are waived, kept so the UI can say "2 waived"
   *  rather than silently showing a clean row. */
  waivedRules: string[];
  /** Total weight of the rules that returned a verdict. 0 means nothing
   *  could be checked, and the score below is not meaningful. */
  checkedWeight: number;
  outcomes: RuleOutcome[];
};

/**
 * Run every rule against one URL.
 *
 * `waivedKeys` is the set of rule keys waived for *this* URL — the caller
 * looks them up; this function does not touch a database.
 */
export function auditUrl(
  input: SeoRuleInput,
  waivedKeys: ReadonlySet<string> = new Set(),
  rules: readonly SeoRule[] = SEO_RULES,
): UrlScore {
  const outcomes: RuleOutcome[] = rules.map((rule) => ({
    key: rule.key,
    severity: rule.severity,
    weight: rule.weight,
    result: rule.check(input),
    waived: waivedKeys.has(rule.key),
  }));

  return scoreOutcomes(outcomes);
}

/** The arithmetic on its own, so a test can score a hand-written set. */
export function scoreOutcomes(outcomes: readonly RuleOutcome[]): UrlScore {
  let checkedWeight = 0;
  let lostWeight = 0;
  const failedRules: string[] = [];
  const waivedRules: string[] = [];

  for (const outcome of outcomes) {
    if (outcome.result.status === "skip") continue;

    if (outcome.waived) {
      // Out of the denominator, not counted as a pass — see the header.
      if (outcome.result.status === "fail") waivedRules.push(outcome.key);
      continue;
    }

    checkedWeight += outcome.weight;
    if (outcome.result.status === "fail") {
      lostWeight += outcome.weight;
      failedRules.push(outcome.key);
    }
  }

  const score =
    checkedWeight === 0 ? 100 : Math.round(((checkedWeight - lostWeight) / checkedWeight) * 100);

  return { score, failedRules, waivedRules, checkedWeight, outcomes: [...outcomes] };
}

/**
 * The run-level numbers SeoAuditRun stores: one row per audit, which is
 * what the history graph and the "▲ 4 since last run" comparison read.
 * SeoUrlState is overwritten every run and cannot answer either question.
 */
export type RunSummary = {
  urlCount: number;
  avgScore: number;
  passAllCount: number;
  failCountByRule: Record<string, number>;
};

export function summariseRun(scores: readonly UrlScore[]): RunSummary {
  const failCountByRule: Record<string, number> = {};
  let total = 0;
  let passAllCount = 0;

  for (const url of scores) {
    total += url.score;
    if (url.failedRules.length === 0) passAllCount += 1;
    for (const key of url.failedRules) {
      failCountByRule[key] = (failCountByRule[key] ?? 0) + 1;
    }
  }

  return {
    urlCount: scores.length,
    // Rounded for storage; the graph plots whole numbers and a stored
    // 71.3333 would render differently in two places.
    avgScore: scores.length === 0 ? 0 : Math.round(total / scores.length),
    passAllCount,
    failCountByRule,
  };
}
