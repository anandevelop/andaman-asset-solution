/**
 * tests/email.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * `isEmailConfigured()` is the gate every send in lib/email.ts checks
 * first — get it wrong and either real mail silently stops going out, or
 * every dev environment without SMTP set starts throwing. Mirrors
 * tests/line.test.ts's approach to isLineConfigured (env-var driven, no
 * network).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured, notifyNewLeadByEmail } from "@/lib/email";

/*
  nodemailer is the only thing stubbed. The transporter in lib/email.ts is a
  lazy module-level singleton, so createTransport runs at most once per file
  — which is why the send spy is created out here and cleared per test
  rather than rebuilt.
*/
const { sendMailSpy } = vi.hoisted(() => ({ sendMailSpy: vi.fn() }));

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

describe("isEmailConfigured", () => {
  const original = process.env.SMTP_HOST;

  beforeEach(() => {
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = original;
  });

  it("is false when SMTP_HOST is unset", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("is false when SMTP_HOST is an empty string", () => {
    process.env.SMTP_HOST = "";
    expect(isEmailConfigured()).toBe(false);
  });

  it("is true once SMTP_HOST is set", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    expect(isEmailConfigured()).toBe(true);
  });
});

/*
  The send path had no test at all, and it is the one the launch checklist
  flags: "implemented but unconfigured by default … degrades to a silent
  no-op until SMTP_HOST is set". Silent is correct here — a lead is already
  committed to Postgres before anyone is emailed about it, so a broken
  mailbox must never become the visitor's 500 — but silent and untested is
  how a channel stops working without anyone noticing for a week.
*/
describe("notifyNewLeadByEmail", () => {
  const originalEnv = { ...process.env };

  const lead = {
    name: "Somchai Prasert",
    email: "somchai@example.com",
    phone: "0812345678",
    message: "Please send the floor plans.",
    projectName: "Trinity Village",
    source: "PROJECT_PAGE",
  };

  beforeEach(() => {
    sendMailSpy.mockReset();
    sendMailSpy.mockResolvedValue({ messageId: "test" });
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.LEAD_NOTIFICATION_TO_EMAIL = "sales@example.com";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("sends the staff copy with the enquiry's details", async () => {
    await notifyNewLeadByEmail(lead);

    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const sent = sendMailSpy.mock.calls[0][0];

    expect(sent.to).toBe("sales@example.com");
    expect(sent.subject).toContain("Somchai Prasert");
    expect(sent.text).toContain("0812345678");
    expect(sent.text).toContain("Trinity Village");
    expect(sent.html).toContain("somchai@example.com");
  });

  it("sends nothing when no staff recipient is configured", async () => {
    delete process.env.LEAD_NOTIFICATION_TO_EMAIL;

    await notifyNewLeadByEmail(lead);

    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only recipient as unset", async () => {
    // A stray space in the deploy env is not an address, and handing it to
    // nodemailer produces an exception rather than a delivery.
    process.env.LEAD_NOTIFICATION_TO_EMAIL = "   ";

    await notifyNewLeadByEmail(lead);

    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("skips, loudly but harmlessly, when SMTP is not configured", async () => {
    delete process.env.SMTP_HOST;
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(notifyNewLeadByEmail(lead)).resolves.toBeUndefined();

    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(logged.mock.calls[0][0]).toContain("not configured");
  });

  it("names the source when the enquiry came from no particular project", async () => {
    // The contact page has no project. "— (CONTACT_PAGE)" still tells the
    // sales team where the person was standing.
    await notifyNewLeadByEmail({ ...lead, projectName: null, source: "CONTACT_PAGE" });

    expect(sendMailSpy.mock.calls[0][0].text).toContain("CONTACT_PAGE");
  });

  it("leaves the message block out when there is no message", async () => {
    await notifyNewLeadByEmail({ ...lead, message: null });

    const sent = sendMailSpy.mock.calls[0][0];
    expect(sent.text).not.toContain("Please send");
    expect(sent.text.endsWith("\n")).toBe(false);
  });

  it("truncates a very long message rather than mailing all of it", async () => {
    await notifyNewLeadByEmail({ ...lead, message: "x".repeat(900) });

    const sent = sendMailSpy.mock.calls[0][0];
    expect(sent.html).toContain("x".repeat(500));
    expect(sent.html).not.toContain("x".repeat(501));
  });

  it("swallows a transport failure instead of failing the enquiry", async () => {
    // The lead row is already committed by the time this runs. Throwing
    // here would turn a captured lead into a 500 for the visitor.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMailSpy.mockRejectedValue(new Error("connection refused"));

    await expect(notifyNewLeadByEmail(lead)).resolves.toBeUndefined();

    expect(logged.mock.calls[0][0]).toContain("[email] send failed");
  });
});
