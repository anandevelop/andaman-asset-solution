/**
 * tests/reports/seo-report-search.test.ts
 * The monthly report reads Search Console from the same table the
 * Keywords screen does, and takes "what to fix" from the newest audit.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  leadInquiry: { findMany: vi.fn(), findFirst: vi.fn() },
  project: { findMany: vi.fn() },
  seoAuditRun: { findFirst: vi.fn() },
  seoQueryStat: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
  webVitalDay: { findMany: vi.fn(), groupBy: vi.fn() },
  reportNote: { findUnique: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const config = vi.hoisted(() => ({ value: { credentials: { email: "a", privateKey: "b" }, gscSiteUrl: "sc-domain:x" } as unknown }));
vi.mock("@/lib/google-config", () => ({ getGoogleConfig: async () => config.value }));

import { getReportData } from "@/lib/reports/seo-report";
import { lastMonth } from "@/lib/reports/period";

const period = lastMonth(new Date("2026-11-13T00:00:00Z"));
const run = () => getReportData({ period, locale: "en", audience: "executive" });

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(prismaMock)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  }
  prismaMock.leadInquiry.findFirst.mockResolvedValue(null);
  prismaMock.reportNote.findUnique.mockResolvedValue(null);
  prismaMock.reportNote.findFirst.mockResolvedValue(null);
  prismaMock.seoAuditRun.findFirst.mockResolvedValue(null);
  prismaMock.seoQueryStat.aggregate.mockResolvedValue({ _sum: { clicks: 40 } });
  prismaMock.project.findMany.mockResolvedValue([{ id: "p1", slug: "victory", nameEn: "The Victory", nameTh: "เดอะ วิคตอรี่" }]);
  config.value = { credentials: { email: "a", privateKey: "b" }, gscSiteUrl: "sc-domain:x" };
});

describe("Search Console in the monthly report", () => {
  it("sums clicks, weights the position by impressions and credits each development", async () => {
    prismaMock.seoQueryStat.findMany.mockResolvedValue([
      { page: "https://andamanassetsolution.com/th/projects/victory", clicks: 30, impressions: 100, position: 4 },
      { page: "https://andamanassetsolution.com/en/projects/victory", clicks: 10, impressions: 300, position: 12 },
      { page: "https://andamanassetsolution.com/en/news/some-article", clicks: 5, impressions: 50, position: 8 },
      { page: "https://andamanassetsolution.com/en", clicks: 15, impressions: 50, position: 2 },
    ]);
    prismaMock.seoQueryStat.groupBy.mockResolvedValue([{ query: "pool villa phuket", _sum: { clicks: 22, impressions: 180 } }]);
    prismaMock.leadInquiry.findMany.mockResolvedValue([
      { projectId: "p1", landingPath: "/projects/victory", landingReferrer: "www.google.com", utmMedium: null },
      { projectId: "p1", landingPath: "/projects/victory", landingReferrer: "www.google.com", utmMedium: null },
    ]);

    const data = await run();

    expect(data.search).toMatchObject({ available: true, clicks: 60, impressions: 500, previousClicks: 40 });
    if (!data.search.available) throw new Error("expected search data");
    expect(data.search.position).toBeCloseTo((4 * 100 + 12 * 300 + 8 * 50 + 2 * 50) / 500);
    expect(data.search.topQueries).toEqual([{ query: "pool villa phuket", clicks: 22, impressions: 180 }]);

    // Both locales of the project page count towards the one development.
    const victory = data.rows.find((row) => row.key === "p1")!;
    expect(victory.googleClicks).toBe(40);
    expect(victory.rate).toBe(5);
    // Clicks earn the news row a place even with no enquiry.
    expect(data.rows.find((row) => row.key === "news")).toMatchObject({ googleClicks: 5, googleLeads: 0, rate: 0 });
  });

  it("says \"no data\" when connected with nothing for the period, and \"not configured\" otherwise", async () => {
    expect((await run()).search).toEqual({ available: false, reason: "noData" });
    config.value = { credentials: null, gscSiteUrl: null };
    expect((await run()).search).toEqual({ available: false, reason: "notConfigured" });
  });
});

describe("what to fix", () => {
  it("comes from the newest audit run, not the last one inside the period", async () => {
    prismaMock.seoAuditRun.findFirst.mockImplementation(async (args: { where?: unknown }) =>
      args.where
        ? { avgScore: 70, runAt: new Date("2026-10-31T00:00:00Z"), failCountByRule: { "og-image": 48, "meta-description": 48 } }
        : { avgScore: 92, runAt: new Date("2026-11-12T00:00:00Z"), failCountByRule: { "image-alt": 3 } },
    );
    const data = await run();
    expect(data.topIssues).toEqual([{ rule: "image-alt", urlCount: 3 }]);
    // The score stays the period's own.
    expect(data.audit.score).toBe(70);
  });
});
