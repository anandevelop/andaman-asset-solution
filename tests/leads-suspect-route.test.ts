/**
 * tests/leads-suspect-route.test.ts
 * POST /api/leads with the spam rules: an ordinary enquiry becomes a lead
 * and is announced; a test-looking one is held, unannounced; a blocked
 * sender is answered and stored nowhere. All three look the same to the
 * visitor.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  leadInquiry: { create: vi.fn(), count: vi.fn() },
  suspectLead: { create: vi.fn(), count: vi.fn() },
  leadBlock: { findFirst: vi.fn() },
  project: { findUnique: vi.fn() },
  pathHitDay: { updateMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/recaptcha", () => ({
  verifyRecaptcha: async () => ({ allowed: true, reason: "ok" }),
  describeOutcome: () => "",
}));
const notifyNewLead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/line", () => ({ notifyNewLead }));
vi.mock("@/lib/email", () => ({ notifyNewLeadByEmail: vi.fn() }));
const assignCapturedLead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lead-routing", () => ({ assignCapturedLead }));
vi.mock("@/lib/notifications", () => ({ isEnabled: async () => false, notifyAdmins: vi.fn() }));

let ip = 0;
const submit = (over: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip}` },
    body: JSON.stringify({
      name: "Somchai Jaidee",
      email: "somchai.j@gmail.com",
      phone: "+66812749031",
      phoneCountry: "TH",
      consentGiven: true,
      ...over,
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.leadBlock.findFirst.mockResolvedValue(null);
  prismaMock.leadInquiry.count.mockResolvedValue(0);
  prismaMock.suspectLead.count.mockResolvedValue(0);
  prismaMock.leadInquiry.create.mockResolvedValue({ id: "lead1" });
  prismaMock.suspectLead.create.mockResolvedValue({ id: "sus1" });
});

describe("POST /api/leads and the spam rules", () => {
  it("makes an ordinary enquiry a lead and announces it", async () => {
    const { POST } = await import("@/app/api/leads/route");
    const res = await POST(submit());
    expect(res.status).toBe(201);
    expect(prismaMock.leadInquiry.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.suspectLead.create).not.toHaveBeenCalled();
    expect(assignCapturedLead).toHaveBeenCalledWith("lead1", null, null);
    expect(notifyNewLead).toHaveBeenCalledTimes(1);
  });

  it("holds a test-looking enquiry without announcing or assigning it", async () => {
    const { POST } = await import("@/app/api/leads/route");
    const res = await POST(submit({ email: "nikolai.tester79@gmail.com", phone: "+66998877665" }));
    expect(res.status).toBe(201);
    expect(prismaMock.leadInquiry.create).not.toHaveBeenCalled();
    const [{ data }] = prismaMock.suspectLead.create.mock.calls[0];
    expect(data.reasons).toEqual(expect.arrayContaining(["email_test", "phone_pattern"]));
    expect(data.input).toMatchObject({ email: "nikolai.tester79@gmail.com", consentGiven: true });
    expect(typeof data.input.consentedAt).toBe("string");
    expect(assignCapturedLead).not.toHaveBeenCalled();
    expect(notifyNewLead).not.toHaveBeenCalled();
  });

  it("holds the third enquiry in a day from the same sender", async () => {
    prismaMock.leadInquiry.count.mockResolvedValue(2);
    const { POST } = await import("@/app/api/leads/route");
    await POST(submit());
    expect(prismaMock.suspectLead.create.mock.calls[0][0].data.reasons).toEqual(["repeat_submit"]);
  });

  it("answers a blocked sender like a success and stores nothing", async () => {
    prismaMock.leadBlock.findFirst.mockResolvedValue({ id: "b1" });
    const { POST } = await import("@/app/api/leads/route");
    const res = await POST(submit());
    expect(res.status).toBe(201);
    expect(prismaMock.leadInquiry.create).not.toHaveBeenCalled();
    expect(prismaMock.suspectLead.create).not.toHaveBeenCalled();
  });
});
