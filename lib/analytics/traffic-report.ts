/**
 * lib/analytics/traffic-report.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What /admin/analytics/sources shows: visits and contact clicks by where
 * the visit came from, with AI on its own line, plus the AI agents and
 * crawlers that fetched pages without running a browser (crawl log).
 *
 * Every figure is a sum over the day tables written by
 * lib/analytics/traffic-store.ts — no row identifies a visitor.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import type { TrafficChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { hitDay } from "@/lib/redirects";
import { AI_AGENT_BOTS, AI_CRAWLER_BOTS } from "@/lib/seo/bots";
import { TRAFFIC_CHANNELS } from "@/lib/analytics/traffic-source";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SourceRow = { source: string; channel: TrafficChannel; visits: number; clicks: number };
export type TrafficReport = {
  days: number;
  since: Date;
  totals: { visits: number; aiVisits: number; clicks: number; aiClicks: number; previousVisits: number; previousAiVisits: number };
  channels: { channel: TrafficChannel; visits: number; clicks: number }[];
  sources: SourceRow[];
  aiSources: SourceRow[];
  aiLanding: { path: string; visits: number }[];
  actions: { action: string; clicks: number; aiClicks: number }[];
  clickPages: { path: string; clicks: number }[];
  trend: { day: string; visits: number; ai: number }[];
  agents: { bot: string; kind: "agent" | "crawler"; hits: number; paths: number }[];
  agentPages: { path: string; hits: number }[];
};

export async function getTrafficReport(days = 30, now = new Date()): Promise<TrafficReport> {
  const end = new Date(hitDay(now).getTime() + DAY_MS);
  const since = new Date(end.getTime() - days * DAY_MS);
  const previousSince = new Date(since.getTime() - days * DAY_MS);
  const inRange = { gte: since, lt: end };
  const aiBots = [...AI_AGENT_BOTS, ...AI_CRAWLER_BOTS] as string[];

  const [visitRows, clickRows, previous, crawl] = await Promise.all([
    safeQuery(
      "traffic:visits",
      () =>
        prisma.trafficVisitDay.findMany({
          where: { day: inRange },
          select: { day: true, channel: true, source: true, landingPath: true, visits: true },
        }),
      [] as { day: Date; channel: TrafficChannel; source: string; landingPath: string; visits: number }[],
    ),
    safeQuery(
      "traffic:clicks",
      () =>
        prisma.contactClickDay.findMany({
          where: { day: inRange },
          select: { action: true, path: true, channel: true, source: true, clicks: true },
        }),
      [] as { action: string; path: string; channel: TrafficChannel; source: string; clicks: number }[],
    ),
    safeQuery(
      "traffic:previous",
      () =>
        prisma.trafficVisitDay.groupBy({
          by: ["channel"],
          where: { day: { gte: previousSince, lt: since } },
          _sum: { visits: true },
        }),
      [] as { channel: TrafficChannel; _sum: { visits: number | null } }[],
    ),
    safeQuery(
      "traffic:aiCrawl",
      () =>
        prisma.crawlHit.groupBy({
          by: ["bot", "path"],
          where: { bot: { in: aiBots }, hour: inRange, notFound: false },
          _sum: { hits: true },
        }),
      [] as { bot: string; path: string; _sum: { hits: number | null } }[],
    ),
  ]);

  const add = <K,>(map: Map<K, number>, key: K, n: number) => map.set(key, (map.get(key) ?? 0) + n);

  // Visits
  const visitsByChannel = new Map<TrafficChannel, number>();
  const visitsBySource = new Map<string, { channel: TrafficChannel; visits: number }>();
  const aiLanding = new Map<string, number>();
  const trend = new Map<string, { visits: number; ai: number }>();
  for (const row of visitRows) {
    add(visitsByChannel, row.channel, row.visits);
    const s = visitsBySource.get(row.source) ?? { channel: row.channel, visits: 0 };
    s.visits += row.visits;
    visitsBySource.set(row.source, s);
    if (row.channel === "AI") add(aiLanding, row.landingPath, row.visits);
    const key = row.day.toISOString().slice(0, 10);
    const t = trend.get(key) ?? { visits: 0, ai: 0 };
    t.visits += row.visits;
    if (row.channel === "AI") t.ai += row.visits;
    trend.set(key, t);
  }

  // Clicks
  const clicksByChannel = new Map<TrafficChannel, number>();
  const clicksBySource = new Map<string, { channel: TrafficChannel; clicks: number }>();
  const actions = new Map<string, { clicks: number; aiClicks: number }>();
  const clickPages = new Map<string, number>();
  for (const row of clickRows) {
    add(clicksByChannel, row.channel, row.clicks);
    const s = clicksBySource.get(row.source) ?? { channel: row.channel, clicks: 0 };
    s.clicks += row.clicks;
    clicksBySource.set(row.source, s);
    const a = actions.get(row.action) ?? { clicks: 0, aiClicks: 0 };
    a.clicks += row.clicks;
    if (row.channel === "AI") a.aiClicks += row.clicks;
    actions.set(row.action, a);
    add(clickPages, row.path, row.clicks);
  }

  const sourceNames = new Set([...visitsBySource.keys(), ...clicksBySource.keys()]);
  const sources: SourceRow[] = [...sourceNames]
    .map((source) => ({
      source,
      channel: (visitsBySource.get(source)?.channel ?? clicksBySource.get(source)?.channel)!,
      visits: visitsBySource.get(source)?.visits ?? 0,
      clicks: clicksBySource.get(source)?.clicks ?? 0,
    }))
    .sort((a, b) => b.visits - a.visits || b.clicks - a.clicks);

  // Every day of the range, zero-filled, so the chart's axis is the range.
  const trendRows: TrafficReport["trend"] = [];
  for (let at = since.getTime(); at < end.getTime(); at += DAY_MS) {
    const key = new Date(at).toISOString().slice(0, 10);
    trendRows.push({ day: key, ...(trend.get(key) ?? { visits: 0, ai: 0 }) });
  }

  // AI agents and crawlers, from the crawl log.
  const agentTotals = new Map<string, { hits: number; paths: number }>();
  const agentPages = new Map<string, number>();
  for (const row of crawl) {
    const hits = row._sum.hits ?? 0;
    const a = agentTotals.get(row.bot) ?? { hits: 0, paths: 0 };
    a.hits += hits;
    a.paths += 1;
    agentTotals.set(row.bot, a);
    if ((AI_AGENT_BOTS as string[]).includes(row.bot)) add(agentPages, row.path, hits);
  }

  const sum = (map: Map<unknown, number>) => [...map.values()].reduce((n, v) => n + v, 0);
  const top = <K,>(map: Map<K, number>, n: number) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  return {
    days,
    since,
    totals: {
      visits: sum(visitsByChannel),
      aiVisits: visitsByChannel.get("AI") ?? 0,
      clicks: sum(clicksByChannel),
      aiClicks: clicksByChannel.get("AI") ?? 0,
      previousVisits: previous.reduce((n, row) => n + (row._sum.visits ?? 0), 0),
      previousAiVisits: previous.find((row) => row.channel === "AI")?._sum.visits ?? 0,
    },
    channels: TRAFFIC_CHANNELS.map((channel) => ({
      channel,
      visits: visitsByChannel.get(channel) ?? 0,
      clicks: clicksByChannel.get(channel) ?? 0,
    })),
    sources: sources.slice(0, 30),
    aiSources: sources.filter((row) => row.channel === "AI"),
    aiLanding: top(aiLanding, 10).map(([path, visits]) => ({ path, visits })),
    actions: [...actions.entries()]
      .map(([action, a]) => ({ action, ...a }))
      .sort((a, b) => b.clicks - a.clicks),
    clickPages: top(clickPages, 10).map(([path, clicks]) => ({ path, clicks })),
    trend: trendRows,
    agents: [...agentTotals.entries()]
      .map(([bot, a]) => ({
        bot,
        kind: (AI_AGENT_BOTS as string[]).includes(bot) ? ("agent" as const) : ("crawler" as const),
        ...a,
      }))
      .sort((a, b) => (a.kind === b.kind ? b.hits - a.hits : a.kind === "agent" ? -1 : 1)),
    agentPages: top(agentPages, 10).map(([path, hits]) => ({ path, hits })),
  };
}
