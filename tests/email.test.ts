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
import {
  escapeHtml,
  isEmailConfigured,
  notifyNewLeadByEmail,
  notifyNewRegistrationByEmail,
  sendRsvpConfirmationEmail,
} from "@/lib/email";

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

/*
  The attendee confirmation is the one message that goes through next-intl.
  Stubbing it with naive {placeholder} substitution keeps the test about
  escaping rather than about translation loading, and lets the vectors below
  travel through the ICU path the real code uses.
*/
vi.mock("next-intl/server", () => ({
  getTranslations: async () => {
    const messages: Record<string, string> = {
      subject: "Registration confirmed: {event}",
      heading: "You are registered",
      greeting: "Hello {name},",
      intro: "Your seat at {event} is confirmed.",
      dateLabel: "Date",
      timeLabel: "Time",
      locationLabel: "Location",
      outro: "We look forward to seeing you.",
      signature: "Andaman Asset Solution",
    };
    return (key: string, values?: Record<string, unknown>) =>
      (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
        String(values?.[name] ?? ""),
      );
  },
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

// ── Escaping ──────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it.each([
    ["<", "&lt;"],
    [">", "&gt;"],
    ['"', "&quot;"],
    ["'", "&#39;"],
    ["&", "&amp;"],
  ])("escapes %s", (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it("escapes the ampersand first, so entities are not doubled", () => {
    // The ordering bug: replacing < before & turns "&lt;" into "&amp;lt;"
    // only if & runs first. Running it last would produce "&lt;" — the
    // literal text the visitor typed silently becoming markup.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text — Thai included — untouched", () => {
    expect(escapeHtml("สมชาย ประเสริฐ")).toBe("สมชาย ประเสริฐ");
  });
});

/*
  Every string in a notification email came from a stranger's form
  submission, and the staff mailbox renders HTML. The care lib/markdown.ts
  takes over article bodies (17 vectors, tests/markdown.test.ts) has to
  apply here too: a working phishing link or a tracking pixel inside a
  message that appears to come from the company's own system is worth more
  to an attacker than one on a public page.

  Same audit shape as tests/markdown.test.ts — assert on what the output
  cannot contain, not on the exact escaping, so the test survives a change
  of escaping strategy.
*/
const VECTORS: [name: string, payload: string][] = [
  ["script tag", '<script>alert(1)</script>'],
  ["attribute break-out", '" onmouseover="alert(1)'],
  ["img onerror", '<img src=x onerror=alert(1)>'],
  ["anchor phishing", '<a href="https://evil.example">Reply here</a>'],
  ["svg payload", "<svg/onload=alert(1)>"],
];

/**
 * Every element the document opens or closes.
 *
 * Grepping the output for `<script` or ` onerror=` — the shape
 * tests/markdown.test.ts uses — gives false positives here, because
 * escaping *keeps* the payload as visible text: `&lt;img src=x
 * onerror=alert(1)&gt;` still contains the substring " onerror=" and is
 * entirely inert. Sanitising deletes, escaping neutralises, so the audit
 * has to ask a different question: did the submission introduce an element
 * that a benign one would not have?
 */
function tagNames(html: string): string[] {
  return [...html.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) =>
    m[1].toLowerCase(),
  );
}

describe("HTML injection into the staff lead notification", () => {
  const base = {
    name: "Somchai",
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

  async function sendLead(overrides: Record<string, unknown> = {}) {
    await notifyNewLeadByEmail({ ...base, ...overrides });
    return sendMailSpy.mock.calls.at(-1)![0];
  }

  // Each of these fields reaches the HTML through a different helper —
  // row(), rowHtml()/link() and a bare interpolation — so they are not
  // four spellings of one test. projectName is here because it is the one
  // a call-site-by-call-site fix would have missed: it comes from
  // `projectSlug` in the request body and is never shown back to the
  // sender, so abuse of it would go unnoticed.
  const FIELDS = ["name", "message", "projectName", "phone"] as const;

  it.each(
    FIELDS.flatMap((field) =>
      VECTORS.map(([label, payload]) => [field, label, payload] as const),
    ),
  )("neutralises a %s in the %s field (%s)", async (field, _label, payload) => {
    const benign = await sendLead();
    const hostile = await sendLead({ [field]: payload });

    expect(hostile.html).not.toContain(payload);
    expect(hostile.html).toContain(escapeHtml(payload));
    expect(new Set(tagNames(hostile.html))).toEqual(new Set(tagNames(benign.html)));
  });

  it("preserves the payload as text rather than deleting it", async () => {
    // The staff copy exists to show what arrived. Sanitising — stripping
    // the tag — would destroy the evidence that anything was attempted,
    // which is why this escapes rather than sanitises.
    await notifyNewLeadByEmail({ ...base, name: "<script>alert(1)</script>" });

    const { html, text } = sendMailSpy.mock.calls[0][0];
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // The plaintext half must NOT be escaped: entities in a text/plain body
    // are the same bug pointing the other way. This assertion is here to
    // stop a well-meaning fix from spreading.
    expect(text).toContain("<script>alert(1)</script>");
  });

  it("keeps a newline out of the subject without mangling it into entities", async () => {
    await notifyNewLeadByEmail({ ...base, name: "Somchai\r\nBcc: evil@example.com" });

    const { subject } = sendMailSpy.mock.calls[0][0];
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toContain("Bcc: evil@example.com");
  });

  it("leaves an ampersand in the subject readable", async () => {
    // A header is not HTML. Escaping one would show the reader "Tom &amp;
    // Jerry" in their inbox list.
    await notifyNewLeadByEmail({ ...base, name: "Tom & Jerry" });

    expect(sendMailSpy.mock.calls[0][0].subject).toContain("Tom & Jerry");
  });
});

describe("notifyNewRegistrationByEmail", () => {
  const registration = {
    name: "Ananya S.",
    email: "ananya@example.com",
    phone: "0898765432",
    agencyName: "Phuket Prime Realty",
    whatsapp: "+66898765432",
    eventTitle: "Trinity Village Open House",
  };

  beforeEach(() => {
    sendMailSpy.mockReset();
    sendMailSpy.mockResolvedValue({ messageId: "test" });
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.LEAD_NOTIFICATION_TO_EMAIL = "sales@example.com";
  });

  it("sends the staff copy with the registration's details", async () => {
    await notifyNewRegistrationByEmail(registration);

    const sent = sendMailSpy.mock.calls[0][0];
    expect(sent.to).toBe("sales@example.com");
    expect(sent.subject).toContain("Ananya S.");
    expect(sent.text).toContain("Phuket Prime Realty");
    expect(sent.html).toContain("Trinity Village Open House");
  });

  it("leaves the WhatsApp row out when there is no number", async () => {
    await notifyNewRegistrationByEmail({ ...registration, whatsapp: null });

    expect(sendMailSpy.mock.calls[0][0].text).not.toContain("WhatsApp");
  });

  it("sends nothing when no staff recipient is configured", async () => {
    delete process.env.LEAD_NOTIFICATION_TO_EMAIL;

    await notifyNewRegistrationByEmail(registration);

    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it.each(VECTORS)("neutralises a %s in the agency name", async (_label, payload) => {
    await notifyNewRegistrationByEmail(registration);
    const benign = sendMailSpy.mock.calls.at(-1)![0];

    await notifyNewRegistrationByEmail({ ...registration, agencyName: payload });
    const hostile = sendMailSpy.mock.calls.at(-1)![0];

    expect(hostile.html).not.toContain(payload);
    expect(hostile.html).toContain(escapeHtml(payload));
    expect(new Set(tagNames(hostile.html))).toEqual(new Set(tagNames(benign.html)));
  });
});

describe("sendRsvpConfirmationEmail", () => {
  const args = {
    to: "ananya@example.com",
    name: "Ananya S.",
    locale: "en",
    eventTitle: "Trinity Village Open House",
    location: "Cherngtalay, Phuket",
    startsAt: new Date("2026-10-15T10:00:00.000Z"),
  };

  beforeEach(() => {
    sendMailSpy.mockReset();
    sendMailSpy.mockResolvedValue({ messageId: "test" });
    process.env.SMTP_HOST = "smtp.example.com";
  });

  it("sends the attendee a localised confirmation", async () => {
    await sendRsvpConfirmationEmail(args);

    const sent = sendMailSpy.mock.calls[0][0];
    expect(sent.to).toBe("ananya@example.com");
    expect(sent.subject).toContain("Trinity Village Open House");
    expect(sent.html).toContain("Ananya S.");
    expect(sent.text).toContain("Cherngtalay, Phuket");
  });

  it("skips when SMTP is not configured", async () => {
    delete process.env.SMTP_HOST;
    vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(sendRsvpConfirmationEmail(args)).resolves.toBeUndefined();

    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it.each(["name", "eventTitle", "location"] as const)(
    "escapes an injected %s even though it arrives through next-intl",
    async (field) => {
      // next-intl's ICU formatter substitutes values verbatim; it has no
      // idea the result is about to become HTML.
      const payload = "<img src=x onerror=alert(1)>";

      await sendRsvpConfirmationEmail(args);
      const benign = sendMailSpy.mock.calls.at(-1)![0];

      await sendRsvpConfirmationEmail({ ...args, [field]: payload });
      const hostile = sendMailSpy.mock.calls.at(-1)![0];

      expect(hostile.html).not.toContain(payload);
      expect(new Set(tagNames(hostile.html))).toEqual(new Set(tagNames(benign.html)));
      expect(hostile.text).toContain(payload);
    },
  );
});
