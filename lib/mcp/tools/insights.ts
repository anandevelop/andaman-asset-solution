/**
 * lib/mcp/tools/insights.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Numbers for an AI client: how enquiries are going, where visitors come
 * from, and how the site scores for SEO and speed. Read-only.
 *
 * ABOUT ENQUIRIES. The decision for this connection is that an AI client
 * never sees who a customer is. So there is no "list leads" here and there
 * will not be one: leads_summary returns counts — by status, by source, by
 * project, by day — and nothing that belongs to a person. No name, phone,
 * email, message, note, or anything typed by a visitor leaves the database
 * through this file. Buckets smaller than the whole are still only counts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "@/lib/mcp/registry";

const daysInput = z.number().int().min(1).max(365).optional().describe("How many days back to look (default 30)");
const since = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

defineTool({
  name: "leads_summary",
  title: "Enquiry numbers",
  description:
    "How many enquiries (leads) arrived in a period and how they break down: by status, by source, by project, by marketing channel (utm source) and per day, plus appointment counts by status. Counts only — this connection cannot see who the customers are, their contact details or their messages.",
  access: "read",
  capability: "viewContent",
  input: { days: daysInput },
  handler: async ({ days = 30 }) => {
    const from = since(days);
    const where = { createdAt: { gte: from } };
    const [total, byStatus, bySource, byProject, byUtm, created, appointments, openNow] = await Promise.all([
      prisma.leadInquiry.count({ where }),
      prisma.leadInquiry.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.leadInquiry.groupBy({ by: ["source"], where, _count: { _all: true } }),
      prisma.leadInquiry.groupBy({ by: ["projectId"], where, _count: { _all: true } }),
      prisma.leadInquiry.groupBy({ by: ["utmSource"], where, _count: { _all: true } }),
      prisma.leadInquiry.findMany({ where, select: { createdAt: true } }),
      prisma.appointment.groupBy({ by: ["status"], where: { scheduledAt: { gte: from } }, _count: { _all: true } }),
      prisma.leadInquiry.count({ where: { status: "NEW", assignedToId: null } }),
    ]);
    const projects = await prisma.project.findMany({
      where: { id: { in: byProject.map((row) => row.projectId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, slug: true },
    });
    const slugOf = new Map(projects.map((p) => [p.id, p.slug]));
    const perDay = new Map<string, number>();
    for (const row of created) perDay.set(dayKey(row.createdAt), (perDay.get(dayKey(row.createdAt)) ?? 0) + 1);
    const tally = <T extends { _count: { _all: number } }>(rows: T[], key: (row: T) => string) =>
      Object.fromEntries(rows.map((row) => [key(row), row._count._all]).sort((a, b) => (b[1] as number) - (a[1] as number)));

    return {
      periodDays: days,
      total,
      newAndUnassignedRightNow: openNow,
      byStatus: tally(byStatus, (row) => row.status),
      bySource: tally(bySource, (row) => row.source),
      byProject: tally(byProject, (row) => (row.projectId ? slugOf.get(row.projectId) ?? "unknown" : "none")),
      byUtmSource: tally(byUtm, (row) => row.utmSource ?? "none"),
      perDay: Object.fromEntries([...perDay].sort()),
      appointmentsByStatus: tally(appointments, (row) => row.status),
    };
  },
});

defineTool({
  name: "traffic_summary",
  title: "Visitor and click numbers",
  description:
    "Where visits came from and what visitors clicked, from the site's own counters: visits by channel (AI, SEARCH, SOCIAL, CAMPAIGN, REFERRAL, DIRECT) and top sources, top landing pages, contact clicks by action (phone, LINE, WhatsApp…), and the most-read articles. Aggregated per day; no individual visitor is recorded.",
  access: "read",
  capability: "viewContent",
  input: { days: daysInput },
  handler: async ({ days = 30 }) => {
    const from = since(days);
    const [byChannel, bySource, byLanding, clicks, read, notFound] = await Promise.all([
      prisma.trafficVisitDay.groupBy({ by: ["channel"], where: { day: { gte: from } }, _sum: { visits: true } }),
      prisma.trafficVisitDay.groupBy({ by: ["source"], where: { day: { gte: from } }, _sum: { visits: true }, orderBy: { _sum: { visits: "desc" } }, take: 15 }),
      prisma.trafficVisitDay.groupBy({ by: ["landingPath"], where: { day: { gte: from } }, _sum: { visits: true }, orderBy: { _sum: { visits: "desc" } }, take: 15 }),
      prisma.contactClickDay.groupBy({ by: ["action"], where: { day: { gte: from } }, _sum: { clicks: true } }),
      prisma.pathHitDay.groupBy({ by: ["path"], where: { kind: "PAGE_VIEW", day: { gte: from } }, _sum: { hits: true }, orderBy: { _sum: { hits: "desc" } }, take: 15 }),
      prisma.pathHitDay.groupBy({ by: ["path"], where: { kind: "NOT_FOUND", day: { gte: from } }, _sum: { hits: true }, orderBy: { _sum: { hits: "desc" } }, take: 15 }),
    ]);
    return {
      periodDays: days,
      visitsByChannel: Object.fromEntries(byChannel.map((row) => [row.channel, row._sum.visits ?? 0])),
      topSources: bySource.map((row) => ({ source: row.source, visits: row._sum.visits ?? 0 })),
      topLandingPages: byLanding.map((row) => ({ path: row.landingPath, visits: row._sum.visits ?? 0 })),
      contactClicks: Object.fromEntries(clicks.map((row) => [row.action, row._sum.clicks ?? 0])),
      mostReadArticles: read.map((row) => ({ path: row.path, views: row._sum.hits ?? 0 })),
      topNotFound: notFound.map((row) => ({ path: row.path, hits: row._sum.hits ?? 0 })),
    };
  },
});

defineTool({
  name: "seo_overview",
  title: "SEO and page speed overview",
  description:
    "The site's own SEO audit: the latest run (average score, pages passing every rule, failures per rule), the lowest-scoring pages with the rules each fails, and the most recent PageSpeed results per page (performance, accessibility, SEO scores and core timings).",
  access: "read",
  capability: "viewContent",
  input: { worst: z.number().int().min(1).max(50).optional().describe("How many of the lowest-scoring pages to return (default 15)") },
  handler: async ({ worst = 15 }) => {
    const [run, pages, speed] = await Promise.all([
      prisma.seoAuditRun.findFirst({ orderBy: { runAt: "desc" } }),
      prisma.seoUrlState.findMany({
        orderBy: { auditScore: "asc" },
        take: worst,
        select: { url: true, locale: true, entityType: true, auditScore: true, failedRules: true, coverageState: true, checkedAt: true },
      }),
      prisma.pageSpeedRun.findMany({
        where: { ok: true },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { path: true, strategy: true, performance: true, accessibility: true, bestPractices: true, seo: true, lcpMs: true, tbtMs: true, cls: true, createdAt: true },
      }),
    ]);
    const seen = new Set<string>();
    const latestSpeed = speed.filter((row) => {
      const key = `${row.path}|${row.strategy}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      latestAudit: run ? { runAt: run.runAt, pages: run.urlCount, averageScore: run.avgScore, passingEveryRule: run.passAllCount, failuresByRule: run.failCountByRule } : null,
      lowestScoringPages: pages,
      pageSpeed: latestSpeed,
    };
  },
});
