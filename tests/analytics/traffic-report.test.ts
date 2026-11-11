/**
 * tests/analytics/traffic-report.test.ts
 * The sums behind /admin/analytics/sources.
 */

import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trafficVisitDay: { findMany: vi.fn(), groupBy: vi.fn() },
  contactClickDay: { findMany: vi.fn() },
  crawlHit: { groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getTrafficReport } from "@/lib/analytics/traffic-report";

describe("getTrafficReport", () => {
  it("adds up visits and clicks by channel and source, with AI on its own", async () => {
    const day = new Date("2026-11-10T00:00:00Z");
    prismaMock.trafficVisitDay.findMany.mockResolvedValue([
      { day, channel: "AI", source: "chatgpt", landingPath: "/projects/victory", visits: 3 },
      { day, channel: "SEARCH", source: "google", landingPath: "/", visits: 10 },
      { day, channel: "AI", source: "perplexity", landingPath: "/projects/victory", visits: 1 },
    ]);
    prismaMock.contactClickDay.findMany.mockResolvedValue([
      { action: "line", path: "/contact", channel: "AI", source: "chatgpt", clicks: 2 },
      { action: "phone", path: "/contact", channel: "SEARCH", source: "google", clicks: 1 },
    ]);
    prismaMock.trafficVisitDay.groupBy.mockResolvedValue([{ channel: "SEARCH", _sum: { visits: 7 } }]);
    prismaMock.crawlHit.groupBy.mockResolvedValue([
      { bot: "chatgpt-user", path: "/projects/victory", _sum: { hits: 4 } },
      { bot: "gptbot", path: "/", _sum: { hits: 9 } },
    ]);

    const report = await getTrafficReport(7, new Date("2026-11-11T05:00:00Z"));

    expect(report.totals).toEqual({
      visits: 14,
      aiVisits: 4,
      clicks: 3,
      aiClicks: 2,
      previousVisits: 7,
      previousAiVisits: 0,
    });
    expect(report.channels.find((c) => c.channel === "AI")).toEqual({ channel: "AI", visits: 4, clicks: 2 });
    expect(report.sources[0]).toEqual({ source: "google", channel: "SEARCH", visits: 10, clicks: 1 });
    expect(report.aiSources.map((s) => s.source)).toEqual(["chatgpt", "perplexity"]);
    expect(report.aiLanding).toEqual([{ path: "/projects/victory", visits: 4 }]);
    expect(report.actions).toEqual([
      { action: "line", clicks: 2, aiClicks: 2 },
      { action: "phone", clicks: 1, aiClicks: 0 },
    ]);
    expect(report.trend).toHaveLength(7);
    expect(report.trend.find((d) => d.day === "2026-11-10")).toEqual({ day: "2026-11-10", visits: 14, ai: 4 });
    // Agents (for a user) before crawlers.
    expect(report.agents.map((a) => [a.bot, a.kind])).toEqual([
      ["chatgpt-user", "agent"],
      ["gptbot", "crawler"],
    ]);
    expect(report.agentPages).toEqual([{ path: "/projects/victory", hits: 4 }]);
  });
});
