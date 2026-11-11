/**
 * tests/analytics/traffic-routes.test.ts
 * The two public counters: a visit's source on its first page view, and
 * contact clicks. Both always answer 204 and only count what they should.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trafficVisitDay: { updateMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  contactClickDay: { updateMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  pathHitDay: { updateMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  liveVisit: { upsert: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/analytics/live-visit", () => ({ recordLiveVisit: vi.fn(), visitHash: () => "h" }));

let ipSeq = 0;
const post = (url: string, body: unknown, ua = "Mozilla/5.0 (iPhone)") =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua, "x-forwarded-for": `10.0.0.${++ipSeq}` },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(prismaMock)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
  }
  prismaMock.trafficVisitDay.count.mockResolvedValue(0);
  prismaMock.contactClickDay.count.mockResolvedValue(0);
  prismaMock.pathHitDay.count.mockResolvedValue(0);
});

describe("POST /api/page-view with a visit", () => {
  it("records the source on the first page of a visit", async () => {
    const { POST } = await import("@/app/api/page-view/route");
    const res = await POST(post("/api/page-view", { path: "/th/projects/victory", visit: { referrer: "chatgpt.com" } }));
    expect(res.status).toBe(204);
    const [{ create }] = prismaMock.trafficVisitDay.upsert.mock.calls[0];
    expect(create).toMatchObject({ channel: "AI", source: "chatgpt", landingPath: "/projects/victory" });
  });

  it("does not count a source without `visit` (a later page) or for a bot", async () => {
    const { POST } = await import("@/app/api/page-view/route");
    await POST(post("/api/page-view", { path: "/th/projects/victory" }));
    await POST(
      post("/api/page-view", { path: "/th/projects/victory", visit: { referrer: "google.com" } }, "Mozilla/5.0 (compatible; Googlebot/2.1)"),
    );
    expect(prismaMock.trafficVisitDay.upsert).not.toHaveBeenCalled();
    expect(prismaMock.trafficVisitDay.updateMany).not.toHaveBeenCalled();
  });

  it("adds to today's row when there already is one", async () => {
    prismaMock.trafficVisitDay.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import("@/app/api/page-view/route");
    await POST(post("/api/page-view", { path: "/en", visit: { referrer: "" } }));
    expect(prismaMock.trafficVisitDay.updateMany.mock.calls[0][0].where).toMatchObject({ source: "direct", landingPath: "/" });
    expect(prismaMock.trafficVisitDay.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/click", () => {
  it("counts a click against the page and the visit's source", async () => {
    const { POST } = await import("@/app/api/click/route");
    const res = await POST(
      post("/api/click", { action: "line", path: "/th/contact", origin: { referrer: "", utmSource: "chatgpt.com" } }),
    );
    expect(res.status).toBe(204);
    const [{ create }] = prismaMock.contactClickDay.upsert.mock.calls[0];
    expect(create).toMatchObject({ action: "line", path: "/contact", channel: "AI", source: "chatgpt" });
  });

  it("ignores an unknown action, an admin path and a bot", async () => {
    const { POST } = await import("@/app/api/click/route");
    await POST(post("/api/click", { action: "hack", path: "/th/contact" }));
    await POST(post("/api/click", { action: "phone", path: "/th/admin/leads" }));
    await POST(post("/api/click", { action: "phone", path: "/th/contact" }, "GPTBot/1.1"));
    expect(prismaMock.contactClickDay.updateMany).not.toHaveBeenCalled();
  });

  it("stops adding new rows once today's cap is reached", async () => {
    prismaMock.contactClickDay.count.mockResolvedValue(3000);
    const { POST } = await import("@/app/api/click/route");
    await POST(post("/api/click", { action: "phone", path: "/th/contact" }));
    expect(prismaMock.contactClickDay.upsert).not.toHaveBeenCalled();
  });

  it("answers 204 to a body that is not JSON", async () => {
    const { POST } = await import("@/app/api/click/route");
    const res = await POST(
      new Request("http://localhost/api/click", { method: "POST", body: "nope", headers: { "x-forwarded-for": "10.9.9.9" } }),
    );
    expect(res.status).toBe(204);
  });
});
