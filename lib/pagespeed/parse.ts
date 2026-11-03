/**
 * lib/pagespeed/parse.ts
 * ─────────────────────────────────────────────────────────────────────────
 * PageSpeed Insights v5 → the columns of one PageSpeedRun row. Pure, so the
 * shape of Google's answer is pinned by tests rather than by a live call.
 *
 * Lab numbers come from lighthouseResult.audits[*].numericValue; field
 * numbers from loadingExperience (this URL), falling back to
 * originLoadingExperience (the whole site) when Chrome has too few visits
 * to the page itself — flagged as scope "origin" so the tab can say so.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Strategy = "mobile" | "desktop";
export const STRATEGIES: readonly Strategy[] = ["mobile", "desktop"];

export type FieldMetric = {
  /** p75. ms for lcp/inp/fcp/ttfb; CLS as the plain score (0.12). */
  p75: number;
  category: "FAST" | "AVERAGE" | "SLOW" | null;
  /** Share of visits that were good / needs improvement / poor, 0–1. */
  good: number;
  ni: number;
  poor: number;
};

export type FieldData = {
  scope: "url" | "origin";
  overall: "FAST" | "AVERAGE" | "SLOW" | null;
  metrics: Partial<Record<"lcp" | "inp" | "cls" | "fcp" | "ttfb", FieldMetric>>;
};

export type Opportunity = { id: string; title: string; savingsMs: number; metric?: string };

export type ParsedRun = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  tbtMs: number | null;
  siMs: number | null;
  ttfbMs: number | null;
  /** x1000, like WebVital. */
  cls: number | null;
  pageBytes: number | null;
  field: FieldData | null;
  opportunities: Opportunity[];
};

type Audit = {
  title?: string;
  score?: number | null;
  numericValue?: number;
  details?: { type?: string; overallSavingsMs?: number };
  metricSavings?: Record<string, number>;
};

type CruxMetric = {
  percentile?: number;
  category?: string;
  distributions?: { min?: number; max?: number; proportion?: number }[];
};

type Experience = { overall_category?: string; metrics?: Record<string, CruxMetric> };

export type PsiResponse = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null } | undefined>;
    audits?: Record<string, Audit | undefined>;
  };
  loadingExperience?: Experience;
  originLoadingExperience?: Experience;
};

const score = (value: number | null | undefined): number | null =>
  typeof value === "number" ? Math.round(value * 100) : null;

const round = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

const category = (value: string | undefined): FieldMetric["category"] =>
  value === "FAST" || value === "AVERAGE" || value === "SLOW" ? value : null;

const CRUX: Record<keyof FieldData["metrics"], string> = {
  lcp: "LARGEST_CONTENTFUL_PAINT_MS",
  inp: "INTERACTION_TO_NEXT_PAINT",
  cls: "CUMULATIVE_LAYOUT_SHIFT_SCORE",
  fcp: "FIRST_CONTENTFUL_PAINT_MS",
  ttfb: "EXPERIMENTAL_TIME_TO_FIRST_BYTE",
};

function fieldFrom(experience: Experience | undefined, scope: FieldData["scope"]): FieldData | null {
  const metrics = experience?.metrics;
  if (!metrics || Object.keys(metrics).length === 0) return null;
  const out: FieldData = { scope, overall: category(experience?.overall_category), metrics: {} };
  for (const [key, name] of Object.entries(CRUX) as [keyof FieldData["metrics"], string][]) {
    const metric = metrics[name];
    if (!metric || typeof metric.percentile !== "number") continue;
    const [good, ni, poor] = [0, 1, 2].map((i) => metric.distributions?.[i]?.proportion ?? 0);
    out.metrics[key] = {
      // Google sends CLS x100 ("12" for 0.12).
      p75: key === "cls" ? metric.percentile / 100 : metric.percentile,
      category: category(metric.category),
      good,
      ni,
      poor,
    };
  }
  return Object.keys(out.metrics).length > 0 ? out : null;
}

/** The fixes worth showing: failing audits that would save time, worst first. */
export function opportunitiesFrom(audits: Record<string, Audit | undefined>, limit = 8): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [id, audit] of Object.entries(audits)) {
    if (!audit || typeof audit.score !== "number" || audit.score >= 0.9) continue;
    const savings = audit.details?.overallSavingsMs ?? audit.metricSavings?.LCP ?? audit.metricSavings?.FCP ?? 0;
    const cls = audit.metricSavings?.CLS ?? 0;
    if (savings > 0) out.push({ id, title: audit.title ?? id, savingsMs: Math.round(savings) });
    else if (cls > 0) out.push({ id, title: audit.title ?? id, savingsMs: 0, metric: "CLS" });
  }
  return out.sort((a, b) => b.savingsMs - a.savingsMs).slice(0, limit);
}

export function parsePsi(body: PsiResponse): ParsedRun {
  const categories = body.lighthouseResult?.categories ?? {};
  const audits = body.lighthouseResult?.audits ?? {};
  const numeric = (id: string) => round(audits[id]?.numericValue);
  const clsRaw = audits["cumulative-layout-shift"]?.numericValue;

  return {
    performance: score(categories.performance?.score),
    accessibility: score(categories.accessibility?.score),
    bestPractices: score(categories["best-practices"]?.score),
    seo: score(categories.seo?.score),
    fcpMs: numeric("first-contentful-paint"),
    lcpMs: numeric("largest-contentful-paint"),
    tbtMs: numeric("total-blocking-time"),
    siMs: numeric("speed-index"),
    ttfbMs: numeric("server-response-time"),
    cls: typeof clsRaw === "number" ? Math.round(clsRaw * 1000) : null,
    pageBytes: numeric("total-byte-weight"),
    field: fieldFrom(body.loadingExperience, "url") ?? fieldFrom(body.originLoadingExperience, "origin"),
    opportunities: opportunitiesFrom(audits),
  };
}

/** Google's bands: 90+ good, 50–89 needs improvement, under 50 poor. */
export function scoreBand(value: number | null | undefined): "good" | "ni" | "poor" | "none" {
  if (typeof value !== "number") return "none";
  return value >= 90 ? "good" : value >= 50 ? "ni" : "poor";
}

/**
 * A pasted link → the path to test, or null when it is not a page of this
 * site. Only http(s), only our own host (www. or not), never /admin or /api.
 */
export function pathFromPastedUrl(input: string, siteUrl: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const site = new URL(siteUrl);
  let url: URL;
  try {
    url = raw.startsWith("/") ? new URL(raw, site) : new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
  if (bare(url.hostname) !== bare(site.hostname)) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (/^\/(?:[a-z]{2}\/)?(?:admin|api)(?:\/|$)/.test(path)) return null;
  return path;
}
