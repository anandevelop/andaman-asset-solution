import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The monthly report is sent once per month and audience. A scheduler bug
  once called the route every few seconds for a week, and each call
  emailed the executives, because the route never looked at what had
  already gone out. These pin the check that stops that.
*/

const findFirst = vi.fn();
const create = vi.fn();
const sendReportEmail = vi.fn();

vi.mock("@/lib/seo/cron-auth", () => ({ guardCron: () => null }));
vi.mock("@/lib/prisma", () => ({ prisma: { reportSend: { findFirst, create } } }));
vi.mock("@/lib/email", () => ({ reportRecipients: () => ["exec@example.com"], sendReportEmail }));
vi.mock("@/lib/reports/seo-report", () => ({ getReportData: async () => ({ note: { body: "note", isDraft: false } }) }));
vi.mock("@/lib/reports/email-body", () => ({ renderReportEmail: async () => ({ subject: "s", html: "h", text: "t" }) }));
vi.mock("@/lib/reports/audience", () => ({ draftNoteText: async () => "draft" }));
vi.mock("@/lib/seo/alerts", () => ({ recordCronFailure: async () => {} }));

const { POST } = await import("@/app/api/cron/monthly-report/route");

beforeEach(() => {
  findFirst.mockReset();
  create.mockReset();
  sendReportEmail.mockReset();
  sendReportEmail.mockResolvedValue({ ok: true, recipientCount: 1 });
});

describe("POST /api/cron/monthly-report", () => {
  it("sends when this month's report has not gone out", async () => {
    findFirst.mockResolvedValue(null);
    const response = await POST(new Request("http://app/api/cron/monthly-report", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(sendReportEmail).toHaveBeenCalledTimes(1);
  });

  it("does not send a second time in the same month", async () => {
    findFirst.mockResolvedValue({ sentAt: new Date("2026-10-01T01:00:00Z") });
    const response = await POST(new Request("http://app/api/cron/monthly-report", { method: "POST" }));
    expect(await response.json()).toMatchObject({ ok: true, skipped: "ALREADY_SENT" });
    expect(sendReportEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("only counts a successful send as already sent", async () => {
    findFirst.mockResolvedValue(null);
    await POST(new Request("http://app/api/cron/monthly-report", { method: "POST" }));
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ audience: "executive", ok: true });
  });

  it("re-sends on purpose with ?force=1", async () => {
    findFirst.mockResolvedValue({ sentAt: new Date() });
    await POST(new Request("http://app/api/cron/monthly-report?force=1", { method: "POST" }));
    expect(sendReportEmail).toHaveBeenCalledTimes(1);
  });
});
