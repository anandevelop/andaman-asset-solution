import { describe, expect, it } from "vitest";
import {
  activityWhere,
  baseWhere,
  categoryOf,
  countByCategory,
  parseActivityFilters,
  rangeSince,
  relativeTime,
} from "@/lib/admin/activity-query";
import { deviceLabel } from "@/lib/audit/device";

describe("categoryOf", () => {
  it.each([
    ["Session", "security"],
    ["LeadInquiry", "crm"],
    ["LeadNote", "crm"],
    ["SuspectLead", "crm"],
    ["Appointment", "crm"],
    ["EventRegistration", "crm"],
    ["Agent", "crm"],
    ["User", "team"],
    ["SalesPerson", "team"],
    ["SalesPersonTranslation", "team"],
    ["Project", "catalog"],
    ["ProjectUnit", "catalog"],
    ["ProjectTranslation", "catalog"],
    ["UnitTypeTranslation", "catalog"],
    ["FloorPlanRoom", "catalog"],
    ["EBrochure", "catalog"],
    ["Event", "content"],
    ["NewsArticle", "content"],
    ["SiteSetting", "content"],
    ["Media", "content"],
    ["SomethingAddedNextYear", "content"],
  ])("%s is %s", (model, group) => expect(categoryOf(model)).toBe(group));
});

describe("parseActivityFilters", () => {
  it("falls back to the defaults for anything unrecognised", () => {
    expect(parseActivityFilters({ tab: "nope", range: "9000" })).toEqual({ category: "all", range: "30", actor: undefined, q: undefined });
  });

  it("reads and trims what it is given", () => {
    expect(parseActivityFilters({ tab: "crm", range: "today", actor: " a@b.test ", q: "  price " })).toEqual({
      category: "crm",
      range: "today",
      actor: "a@b.test",
      q: "price",
    });
  });
});

describe("rangeSince", () => {
  const now = new Date("2026-11-14T08:30:00Z"); // 15:30 in Bangkok

  it("starts today at midnight in Bangkok, not on the server", () => {
    expect(rangeSince("today", now)?.toISOString()).toBe("2026-11-13T17:00:00.000Z");
  });

  it("counts days back, and has no start for all time", () => {
    expect(rangeSince("7", now)?.toISOString()).toBe("2026-11-07T08:30:00.000Z");
    expect(rangeSince("all", now)).toBeNull();
  });
});

describe("the where clauses", () => {
  const now = new Date("2026-11-14T08:30:00Z");

  it("counts tabs over everything but the tab", () => {
    const filters = parseActivityFilters({ tab: "security", range: "7", actor: "a@b.test" });
    const base = baseWhere(filters, now);
    expect(base).toMatchObject({ actorEmail: "a@b.test" });
    expect(JSON.stringify(base)).not.toContain("Session");
    expect(JSON.stringify(activityWhere(filters, now))).toContain("Session");
  });

  it("gives content everything the other groups do not claim", () => {
    const where = activityWhere(parseActivityFilters({ tab: "content", range: "all" }), now);
    const text = JSON.stringify(where);
    expect(text).toContain('"NOT"');
    for (const prefix of ["Session", "Lead", "User", "Project"]) expect(text).toContain(`"startsWith":"${prefix}"`);
  });

  it("searches the label, the address, the IP and the field names", () => {
    const base = baseWhere(parseActivityFilters({ q: "priceTHB", range: "all" }), now);
    expect(base.OR).toHaveLength(4);
    expect(base).not.toHaveProperty("createdAt");
  });
});

describe("countByCategory", () => {
  it("folds model counts into the six tabs", () => {
    expect(
      countByCategory([
        { model: "Session", count: 5 },
        { model: "ProjectUnit", count: 3 },
        { model: "Project", count: 1 },
        { model: "LeadInquiry", count: 2 },
        { model: "Faq", count: 4 },
      ]),
    ).toEqual({ all: 15, crm: 2, catalog: 4, content: 4, team: 0, security: 5 });
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-11-14T08:30:00Z");
  const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now, "en");

  it("is coarse: now, minutes, hours, days", () => {
    expect(ago(5_000)).toBe("now");
    expect(ago(25 * 60_000)).toMatch(/25 min/);
    expect(ago(2 * 3_600_000)).toMatch(/2 hr/);
    expect(ago(3 * 86_400_000)).toMatch(/3 days/);
  });
});

describe("deviceLabel", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome · Mac"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari · iPhone"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", "Edge · Windows"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Chrome · Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0", "Firefox · Windows"],
  ])("reads %s", (ua, label) => expect(deviceLabel(ua)).toBe(label));

  it("has nothing to say about nothing", () => {
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel("  ")).toBeNull();
    expect(deviceLabel("curl/8.4.0")).toBeNull();
  });
});
