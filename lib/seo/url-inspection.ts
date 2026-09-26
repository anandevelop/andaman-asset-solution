/**
 * lib/seo/url-inspection.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Does Google have this page, and if not, why not" — one URL at a time,
 * against a quota that is the only hard limit in this whole system.
 *
 * TWO THOUSAND URLS A DAY, PER PROPERTY
 *
 * Not per service account, not per project. The site has 80 audited URLs
 * today, so every one can be checked nightly with room to spare — and that
 * is exactly why the rotation is written now rather than when it is
 * needed. A site that grows past 2,000 URLs without it does not fail
 * loudly: the sweep runs out of quota partway through, the same alphabetical
 * head gets checked every night, and the tail is never looked at again.
 *
 * So the order is a rotation. Least-recently-inspected first, which means
 * a site of any size converges on "everything checked eventually" and a
 * new page is picked up on the next run rather than whenever its slug
 * sorts.
 *
 * INSPECTED URLS MUST COME FROM THE PROPERTY
 *
 * Google answers 403 — "you do not own this site, or the inspected URL is
 * not part of this property" — for any URL outside the registered
 * property, and that is indistinguishable from a permissions problem. On
 * this deployment the property is the staging host while the site's own
 * canonical URL is the production domain, so building inspection URLs from
 * siteConfig would 403 on every single one. They are built from the
 * property URL, always.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { getAccessToken, SCOPES } from "@/lib/seo/google-client";

/** Google's daily cap, per property. */
export const DAILY_QUOTA = 2_000;

/**
 * Left unused each run.
 *
 * Inspection shares its quota with anything else that calls the API for
 * this property — a person clicking "Test live URL" in Search Console, or
 * a second deployment pointed at the same site. Spending the last of it
 * nightly means their click fails with a quota error they cannot explain.
 */
export const QUOTA_RESERVE = 50;

const ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

export type InspectionVerdict =
  | "PASS"
  | "PARTIAL"
  | "FAIL"
  | "NEUTRAL"
  | "VERDICT_UNSPECIFIED";

export type InspectionResult = {
  url: string;
  verdict: InspectionVerdict;
  /** Google's own phrasing: "Submitted and indexed", "Crawled — currently
   *  not indexed", "URL is unknown to Google". Stored verbatim because it
   *  is the most useful sentence in the whole API. */
  coverageState: string | null;
  /** The URL Google considers canonical, which is how a duplicate-content
   *  problem announces itself. */
  googleCanonical: string | null;
  lastCrawledAt: Date | null;
  robotsTxtState: string | null;
  indexingState: string | null;
};

export type InspectionOutcome =
  | { ok: true; result: InspectionResult }
  | { ok: false; url: string; error: string; quotaExhausted: boolean };

/**
 * Which URLs to spend today's quota on.
 *
 * Never inspected first — a page Google has never been asked about is the
 * one most likely to be missing — then oldest first. Ties keep their input
 * order, so a stable list stays stable rather than shuffling nightly.
 */
export function selectForInspection<T extends { url: string; inspectedAt: Date | null }>(
  candidates: readonly T[],
  budget: number = DAILY_QUOTA - QUOTA_RESERVE,
): T[] {
  if (budget <= 0) return [];

  return [...candidates]
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const left = a.candidate.inspectedAt;
      const right = b.candidate.inspectedAt;

      if (left === null && right === null) return a.index - b.index;
      if (left === null) return -1;
      if (right === null) return 1;

      const byAge = left.getTime() - right.getTime();
      return byAge !== 0 ? byAge : a.index - b.index;
    })
    .slice(0, budget)
    .map((entry) => entry.candidate);
}

/**
 * Build an inspectable URL from a stored path.
 *
 * The property URL is the base, never the site's canonical origin — see
 * the header. Both halves are normalised so "https://host/" + "/th/about"
 * does not become a double slash, which Google treats as a different URL
 * and reports as unknown.
 */
export function inspectionUrlFor(propertyUrl: string, path: string): string {
  const base = propertyUrl.endsWith("/") ? propertyUrl.slice(0, -1) : propertyUrl;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

type FetchLike = typeof fetch;

/** Inspect one URL. */
export async function inspectUrl(
  propertyUrl: string,
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<InspectionOutcome> {
  const token = await getAccessToken(SCOPES.searchConsole);
  if (!token.ok) return { ok: false, url, error: token.error, quotaExhausted: false };

  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: propertyUrl }),
      signal: AbortSignal.timeout(30_000),
    });

    const body = (await response.json()) as {
      inspectionResult?: { indexStatusResult?: Record<string, string> };
      error?: { message?: string; status?: string };
    };

    if (!response.ok) {
      /*
        429 means the daily quota is gone. The caller has to stop rather
        than keep asking — every further request is refused and the run
        turns into two thousand pointless round trips — so it is reported
        as its own fact rather than as one more error string.
      */
      const quotaExhausted = response.status === 429 || body.error?.status === "RESOURCE_EXHAUSTED";

      return {
        ok: false,
        url,
        error: `${response.status}: ${body.error?.message ?? "no detail"}`,
        quotaExhausted,
      };
    }

    const status = body.inspectionResult?.indexStatusResult ?? {};

    return {
      ok: true,
      result: {
        url,
        verdict: (status.verdict as InspectionVerdict) ?? "VERDICT_UNSPECIFIED",
        coverageState: status.coverageState ?? null,
        googleCanonical: status.googleCanonical ?? null,
        lastCrawledAt: status.lastCrawlTime ? new Date(status.lastCrawlTime) : null,
        robotsTxtState: status.robotsTxtState ?? null,
        indexingState: status.indexingState ?? null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
      quotaExhausted: false,
    };
  }
}

export type SweepResult = {
  inspected: number;
  failed: number;
  /** True when the run stopped early because Google refused on quota. */
  stoppedOnQuota: boolean;
  results: InspectionResult[];
};

/**
 * Inspect a list, stopping the moment quota runs out.
 *
 * Sequential on purpose. The quota is per property and the limit is daily,
 * so there is nothing to gain from concurrency except hitting the ceiling
 * faster and turning a clean stop into a burst of refusals.
 */
export async function sweepInspections(
  propertyUrl: string,
  urls: readonly string[],
  fetchImpl: FetchLike = fetch,
): Promise<SweepResult> {
  const results: InspectionResult[] = [];
  let failed = 0;

  for (const url of urls) {
    const outcome = await inspectUrl(propertyUrl, url, fetchImpl);

    if (outcome.ok) {
      results.push(outcome.result);
      continue;
    }

    failed += 1;

    if (outcome.quotaExhausted) {
      return { inspected: results.length, failed, stoppedOnQuota: true, results };
    }
  }

  return { inspected: results.length, failed, stoppedOnQuota: false, results };
}
