/**
 * lib/pagespeed/run.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Calling PageSpeed Insights, with the brakes on.
 *
 * Google's free quota (25,000 calls a day) is not the limit that bites: a
 * full scan is about 16 calls. What needs guarding is everything else:
 *
 *   - at most TWO calls in flight from this process, whoever asked — each
 *     call holds a connection for 10–60 s, and Google also limits calls per
 *     100 seconds;
 *   - the same page on the same device within FIVE minutes answers from the
 *     last result (writes nothing, costs nothing) unless forced;
 *   - "scan everything" cannot start while one is running, nor within TEN
 *     minutes of the last one finishing (the schedule ignores the cooldown);
 *   - our own daily ceiling (default 1,000 calls, set on the card) stops a
 *     runaway loop long before Google's;
 *   - a 429 waits and tries once more, then gives up on that page.
 *
 * Every call to Google writes a PageSpeedRun row, failures included, so the
 * day's usage is simply a count of rows.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { Prisma, type PageSpeedRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { pushLineAlert } from "@/lib/line";
import { getPsiConfig, strategiesFor } from "./config";
import { parsePsi, type PsiResponse, type Strategy } from "./parse";
import { CACHE_MS, SCAN_STALE_MS, scanBlocked, startOfDayBangkok, type RunSource, type ScanState } from "./limits";

export { CACHE_MS, SCAN_COOLDOWN_MS, scanBlocked, startOfDayBangkok, type RunSource, type ScanState } from "./limits";

const MAX_IN_FLIGHT = 2;
const RETRY_AFTER_MS = 20_000;
const CALL_TIMEOUT_MS = 90_000;

const SCAN_KEY = "psi.scan";

export type RunOutcome =
  | { ok: true; run: PageSpeedRun; cached: boolean }
  | { ok: false; error: "NO_KEY" | "DAILY_CAP" | "RATE_LIMITED" | "BAD_KEY" | "FETCH_FAILED" | "UNREACHABLE"; detail?: string; run?: PageSpeedRun };

export function siteBase(): string {
  return siteConfig.url.replace(/\/+$/, "");
}

export async function callsToday(): Promise<number> {
  return prisma.pageSpeedRun.count({ where: { createdAt: { gte: startOfDayBangkok() } } });
}

// ── At most MAX_IN_FLIGHT calls at once, process-wide ───────────────────
let inFlight = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight += 1;
  try {
    return await task();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Call =
  | { ok: true; body: PsiResponse }
  | { ok: false; status: number; error: Exclude<Extract<RunOutcome, { ok: false }>["error"], "NO_KEY" | "DAILY_CAP">; detail?: string };

async function callGoogle(url: string, strategy: Strategy, key: string, hl: string): Promise<Call> {
  const query = new URLSearchParams({ url, strategy, locale: hl, key });
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) query.append("category", c);
  try {
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as (PsiResponse & { error?: { message?: string } }) | null;
    if (response.ok && body?.lighthouseResult) return { ok: true, body };
    const detail = body?.error?.message?.slice(0, 300);
    if (response.status === 429) return { ok: false, status: 429, error: "RATE_LIMITED", detail };
    if (response.status === 400 && /api key/i.test(detail ?? "")) return { ok: false, status: 400, error: "BAD_KEY", detail };
    if (response.status === 403) return { ok: false, status: 403, error: "BAD_KEY", detail };
    return { ok: false, status: response.status, error: "FETCH_FAILED", detail };
  } catch (error) {
    return { ok: false, status: 0, error: "UNREACHABLE", detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Test one page on one device. `path` includes the locale ("/th/news").
 * `hl` is the language Google writes its suggestions in.
 */
export async function runPageSpeed(input: {
  path: string;
  strategy: Strategy;
  source: RunSource;
  force?: boolean;
  hl?: string;
}): Promise<RunOutcome> {
  const { path, strategy, source } = input;
  const config = await getPsiConfig();
  if (!config.apiKey) return { ok: false, error: "NO_KEY" };

  if (!input.force) {
    const recent = await prisma.pageSpeedRun.findFirst({
      where: { path, strategy, ok: true, createdAt: { gte: new Date(Date.now() - CACHE_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent) return { ok: true, run: recent, cached: true };
  }

  const url = `${siteBase()}${path === "/" ? "/" : path}`;
  const key = config.apiKey;

  return withSlot(async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if ((await callsToday()) >= config.dailyCap) return { ok: false as const, error: "DAILY_CAP" as const };

      const call = await callGoogle(url, strategy, key, input.hl ?? "th");
      if (call.ok) {
        const parsed = parsePsi(call.body);
        const run = await prisma.pageSpeedRun.create({
          data: {
            url,
            path,
            strategy,
            source,
            ok: true,
            ...parsed,
            field: parsed.field ? (parsed.field as Prisma.InputJsonValue) : Prisma.JsonNull,
            opportunities: parsed.opportunities as Prisma.InputJsonValue,
          },
        });
        return { ok: true as const, run, cached: false };
      }

      const run = await prisma.pageSpeedRun.create({
        data: { url, path, strategy, source, ok: false, error: call.error },
      });
      if (call.error === "RATE_LIMITED" && attempt === 0) {
        await sleep(RETRY_AFTER_MS);
        continue;
      }
      return { ok: false as const, error: call.error, detail: call.detail, run };
    }
    return { ok: false as const, error: "RATE_LIMITED" as const };
  });
}

// ── The scan: the preset pages on each configured device ────────────────

const LOCK_KEY = "psi.scanLock";

/**
 * Atomic: creating a row with a fixed primary key succeeds for exactly one
 * caller. A lock older than SCAN_STALE_MS belongs to a scan that crashed
 * (the process restarted mid-scan) and is taken over.
 */
async function claimScanLock(): Promise<boolean> {
  const create = () =>
    prisma.siteSetting.create({ data: { key: LOCK_KEY, value: new Date().toISOString() } }).then(
      () => true,
      () => false,
    );
  if (await create()) return true;
  const stale = await prisma.siteSetting.deleteMany({
    where: { key: LOCK_KEY, updatedAt: { lt: new Date(Date.now() - SCAN_STALE_MS) } },
  });
  return stale.count > 0 ? create() : false;
}

export async function getScanState(): Promise<ScanState | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: SCAN_KEY } }).catch(() => null);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as ScanState;
  } catch {
    return null;
  }
}

async function putScanState(state: ScanState): Promise<void> {
  const value = JSON.stringify(state);
  await prisma.siteSetting.upsert({ where: { key: SCAN_KEY }, create: { key: SCAN_KEY, value }, update: { value } });
}

export type Preset = { key: string; path: string; label?: string };

/** The pages a scan covers, in one language: about 8 pages. */
export async function presetPages(locale = "th"): Promise<Preset[]> {
  const [project, article] = await Promise.all([
    prisma.project
      .findFirst({ where: { isPublished: true, deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { slug: true, nameEn: true, nameTh: true } })
      .catch(() => null),
    prisma.newsArticle
      .findFirst({
        where: { isPublished: true, deletedAt: null, publishedAt: { not: null, lte: new Date() } },
        orderBy: { publishedAt: "desc" },
        select: { slug: true },
      })
      .catch(() => null),
  ]);
  const l = `/${locale}`;
  return [
    { key: "home", path: l },
    { key: "projects", path: `${l}/projects` },
    ...(project ? [{ key: "project", path: `${l}/projects/${project.slug}`, label: project.nameTh || project.nameEn }] : []),
    { key: "news", path: `${l}/news` },
    ...(article ? [{ key: "latestNews", path: `${l}/news/${article.slug}` }] : []),
    { key: "progress", path: `${l}/progress` },
    { key: "about", path: `${l}/about` },
    { key: "contact", path: `${l}/contact` },
  ];
}

/**
 * Run the scan. Returns at once with a refusal when one is running or
 * cooling down; otherwise works through every page (two at a time) and
 * returns when done — call it from after() or a cron route.
 */
export async function runScan(source: RunSource): Promise<
  { ok: false; error: "RUNNING" | "COOLDOWN" | "NO_KEY"; until?: string } | { ok: true; done: number; failed: number }
> {
  const config = await getPsiConfig();
  if (!config.apiKey) return { ok: false, error: "NO_KEY" };
  const blocked = scanBlocked(await getScanState(), source);
  if (blocked) return { ok: false, error: blocked.reason, until: blocked.until };
  // Check-then-write above is not enough on its own: two clicks (or two
  // admins) a moment apart would both pass it. The lock row is the claim.
  if (!(await claimScanLock())) return { ok: false, error: "RUNNING" };

  const pages = await presetPages("th");
  const jobs = pages.flatMap((page) => strategiesFor(config.strategies).map((strategy) => ({ page, strategy })));
  const state: ScanState = { startedAt: new Date().toISOString(), finishedAt: null, total: jobs.length, done: 0, failed: 0, source };
  await putScanState(state);

  const results: { path: string; strategy: Strategy; performance: number | null }[] = [];
  let stop = false;
  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job && !stop; job = queue.shift()) {
      const outcome = await runPageSpeed({ path: job.page.path, strategy: job.strategy, source, force: source === "scheduled" });
      if (outcome.ok) results.push({ path: job.page.path, strategy: job.strategy, performance: outcome.run.performance });
      else {
        state.failed += 1;
        if (outcome.error === "DAILY_CAP" || outcome.error === "BAD_KEY" || outcome.error === "NO_KEY") stop = true;
      }
      state.done += 1;
      await putScanState(state).catch(() => {});
    }
  };
  try {
    await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, worker));
  } finally {
    state.finishedAt = new Date().toISOString();
    await putScanState(state).catch(() => {});
    await prisma.siteSetting.deleteMany({ where: { key: LOCK_KEY } }).catch(() => {});
  }

  if (source === "scheduled" && config.alertBelow > 0) {
    await alertOnDrops(results, config.alertBelow, new Date(state.startedAt)).catch((error) =>
      console.error("[pagespeed] alert failed", error),
    );
  }
  return { ok: true, done: state.done, failed: state.failed };
}

/** LINE, once, for mobile pages that have just fallen under the bar. */
async function alertOnDrops(
  results: { path: string; strategy: Strategy; performance: number | null }[],
  below: number,
  scanStart: Date,
): Promise<void> {
  const dropped: [string, string][] = [];
  for (const r of results) {
    if (r.strategy !== "mobile" || r.performance === null || r.performance >= below) continue;
    const before = await prisma.pageSpeedRun.findFirst({
      where: { path: r.path, strategy: "mobile", ok: true, createdAt: { lt: scanStart } },
      orderBy: { createdAt: "desc" },
      select: { performance: true },
    });
    if (before?.performance != null && before.performance < below) continue;
    dropped.push([r.path, before?.performance != null ? `${before.performance} → ${r.performance}` : `${r.performance}`]);
  }
  if (dropped.length === 0) return;
  await pushLineAlert({
    kind: "pagespeed",
    title: `⚡ คะแนนความเร็วมือถือต่ำกว่า ${below}`,
    rows: dropped.slice(0, 8),
    url: `${siteBase()}/th/admin/seo/speed`,
    urlLabel: "ดูหน้าความเร็ว",
  });
}

// ── Reads for the speed tab ─────────────────────────────────────────────

/** A run without its two JSON columns: the table never shows them. */
export type RunSummary = Omit<PageSpeedRun, "field" | "opportunities">;

export type PathSummary = {
  path: string;
  latest: RunSummary;
  previousPerformance: number | null;
};

const SUMMARY_SELECT = {
  id: true,
  url: true,
  path: true,
  strategy: true,
  source: true,
  ok: true,
  error: true,
  performance: true,
  accessibility: true,
  bestPractices: true,
  seo: true,
  fcpMs: true,
  lcpMs: true,
  tbtMs: true,
  siMs: true,
  ttfbMs: true,
  cls: true,
  pageBytes: true,
  createdAt: true,
} satisfies Prisma.PageSpeedRunSelect;

/** The latest successful run of every path tested in the last 90 days. */
export async function latestByPath(strategy: Strategy): Promise<PathSummary[]> {
  const rows = await prisma.pageSpeedRun.findMany({
    where: { strategy, ok: true, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: SUMMARY_SELECT,
  });
  const out = new Map<string, PathSummary>();
  for (const row of rows) {
    const seen = out.get(row.path);
    if (!seen) out.set(row.path, { path: row.path, latest: row, previousPerformance: null });
    else if (seen.previousPerformance === null && row.performance !== null && seen.latest.id !== row.id) {
      seen.previousPerformance = row.performance;
    }
  }
  return [...out.values()];
}

export async function pathHistory(path: string, strategy: Strategy, take = 8): Promise<PageSpeedRun[]> {
  const rows = await prisma.pageSpeedRun.findMany({
    where: { path, strategy, ok: true },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.reverse();
}

export async function lastFailure(path: string, strategy: Strategy): Promise<PageSpeedRun | null> {
  return prisma.pageSpeedRun.findFirst({ where: { path, strategy, ok: false }, orderBy: { createdAt: "desc" } });
}
