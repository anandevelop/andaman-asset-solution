/**
 * lib/email.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Transactional email — SMTP via nodemailer.
 *
 * Two kinds of message, same fire-and-forget contract as lib/line.ts:
 *
 *   1. Staff notifications (new lead, new RSVP) — a second channel
 *      alongside the LINE push, in case nobody is watching LINE that day.
 *      Fixed Thai copy, matching the LINE Flex cards this mirrors.
 *
 *   2. The RSVP confirmation sent to the attendee themselves — the one
 *      thing the event copy explicitly promises ("we will confirm by
 *      email"). Localised via next-intl with an explicit `locale`, the
 *      same pattern every page already uses for generateMetadata.
 *
 * Configuration is optional throughout. Without SMTP_HOST, every send is a
 * logged no-op — nothing here ever throws into the request that triggered
 * it, because the lead/RSVP is already committed to Postgres by the time
 * we try to email anyone.
 *
 * Every string in these messages came from a stranger's form submission, so
 * the escaping contract is load-bearing and asymmetric:
 *
 *   - the `html` half escapes everything, and `row()` does it by default so
 *     a new field is safe without anyone remembering;
 *   - the `text` half escapes nothing — entities in a plaintext body are
 *     the same bug pointing the other way;
 *   - subjects are neither: a header is not HTML, but it cannot survive a
 *     newline. See singleLine().
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getTranslations } from "next-intl/server";
import { intlLocale } from "@/lib/format";
import { siteConfig } from "@/config/site";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/** Lazy singleton — a transporter opens no connection until first send. */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

function fromAddress(): string {
  const name = process.env.SMTP_FROM_NAME || siteConfig.name;
  const email =
    process.env.SMTP_FROM_EMAIL || "no-reply@andamanassetsolution.com";
  return `"${name}" <${email}>`;
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Fire-and-forget send. Never throws — callers do `void sendMail(...)`
 * exactly like `void notifyNewLead(...)` in lib/line.ts, because a broken
 * mailbox must never turn a successful lead/RSVP capture into a 500 for
 * the visitor.
 */
async function sendMail(args: SendArgs): Promise<void> {
  if (!isEmailConfigured()) {
    console.info("[email] not configured — skipping send");
    return;
  }

  try {
    await getTransporter().sendMail({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
  } catch (error) {
    console.error("[email] send failed", error);
  }
}

/**
 * A real send, with the failure reported back rather than swallowed.
 *
 * Every other send in this file is fire-and-forget on purpose: a broken
 * mailbox must not turn a visitor's successful enquiry into an error. The
 * settings screen's "test" button is the exact opposite case — it exists to
 * find out whether sending works, so a failure that printed to a log
 * nobody is reading would make the button worthless.
 */
export async function sendDiagnosticEmail(
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "NOT_CONFIGURED" };

  try {
    await getTransporter().sendMail({
      from: fromAddress(),
      to,
      subject: `${siteConfig.name} — SMTP test`,
      text:
        "This is a test message from the Andaman Asset Solution back office.\n" +
        "If you are reading it, outgoing email is working.",
      html:
        "<p>This is a test message from the Andaman Asset Solution back office.</p>" +
        "<p>If you are reading it, outgoing email is working.</p>",
    });
    return { ok: true };
  } catch (error) {
    // The message is shown to an administrator, who is the person who can
    // act on "Invalid login" or "ECONNREFUSED".
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * A scheduled send whose outcome is recorded.
 *
 * Between the two shapes above: not fire-and-forget, because ReportSend
 * stores whether the monthly report actually went out and "we think so"
 * is not an answer anybody can act on — and not the settings screen's
 * diagnostic either, because nobody is standing there watching it.
 *
 * NOT_CONFIGURED is returned rather than thrown: a deployment with no SMTP
 * is a deployment that has not finished being set up, not a broken one, and
 * the reports screen says so in a sentence instead of showing a stack
 * trace.
 */
export async function sendReportEmail(args: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<
  { ok: true; recipientCount: number } | { ok: false; error: string }
> {
  if (!isEmailConfigured()) return { ok: false, error: "NOT_CONFIGURED" };
  if (args.to.length === 0) return { ok: false, error: "NO_RECIPIENTS" };

  try {
    await getTransporter().sendMail({
      from: fromAddress(),
      to: args.to.join(", "),
      subject: singleLine(args.subject),
      html: args.html,
      text: args.text,
    });

    return { ok: true, recipientCount: args.to.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The addresses scheduled reports and alerts go to.
 *
 * An environment variable rather than a settings row: it is deployment
 * configuration, it contains no content anybody edits day to day, and
 * putting it in the settings table would have meant adding it to the
 * allowlist the settings form rewrites wholesale — where a save of an
 * unrelated field clears it.
 *
 * Empty is a legitimate state and never an error. Nothing is sent, the
 * reports screen says nobody is configured, and the site runs exactly as
 * before.
 */
export function reportRecipients(): string[] {
  return (process.env.REPORT_RECIPIENTS ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.includes("@"));
}

// ── Escaping ────────────────────────────────────────────────────────────

/**
 * Escape a value for interpolation into HTML text or a double-quoted
 * attribute.
 *
 * Deliberately not DOMPurify, which lib/markdown.ts uses for article
 * bodies. That sanitises markup an author meant to render, against a tag
 * allowlist. A visitor's name is not markup — it is text, and the right
 * handling of text in an HTML context is escaping. Sanitising would also
 * *delete* what a hostile submitter sent, destroying the evidence in a
 * notification whose whole job is to show staff what arrived. And it strips
 * tags without escaping `"`, which is the character that matters at
 * href="tel:…".
 *
 * `&` goes first, or the entities the later replacements introduce get
 * escaped a second time.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Flatten a subject line. Escaping one would put a literal "&amp;" in front
 * of the reader; what a header genuinely cannot carry is a newline, which
 * is how a submitted name turns into an injected header.
 */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

// ── Shared layout ───────────────────────────────────────────────────────

const PRIMARY = "#083551";

/** Minimal inline-styled shell — table-based, no external CSS, renders
 *  consistently across Gmail/Outlook/Apple Mail without a build step. */
function wrap(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F5F5F4;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:4px;overflow:hidden;">
            <tr>
              <td style="background:${PRIMARY};padding:20px 28px;">
                <span style="color:#E8B384;font-size:11px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;">ANDAMAN ASSET</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#1F2937;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * A label/value row. Escapes both halves, so every plain data row is safe
 * without the call site doing anything.
 *
 * Escaping here rather than at each call site is the point: the six sites a
 * review would name are not the whole set. `lead.projectName` reaches this
 * function from `data.projectSlug` in the request body
 * (app/api/leads/route.ts), constrained only by a max length, and it is
 * never shown back to the person who sent it — so nobody would notice it
 * being abused. Safe-by-default catches it for free.
 */
function row(label: string, value: string): string {
  return rowHtml(label, escapeHtml(value));
}

/** Same markup, for a value that is already known-safe HTML. */
function rowHtml(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:4px 12px 4px 0;color:#8C9BA5;font-size:12px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:4px 0;color:#333333;font-size:13px;">${valueHtml}</td>
  </tr>`;
}

/** The one place an anchor is built — href and text both escaped. */
function link(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${PRIMARY};">${escapeHtml(text)}</a>`;
}

// ── Staff notifications ─────────────────────────────────────────────────

function staffRecipient(): string | null {
  const to = process.env.LEAD_NOTIFICATION_TO_EMAIL;
  return to && to.trim().length > 0 ? to.trim() : null;
}

/** New enquiry from the lead form — staff copy, mirrors lib/line.ts's leadCard. */
export async function notifyNewLeadByEmail(lead: {
  name: string;
  email: string;
  phone: string;
  message: string | null;
  projectName: string | null;
  source: string;
}): Promise<void> {
  const to = staffRecipient();
  if (!to) return;

  const html = wrap(`
    <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;color:${PRIMARY};">ผู้สนใจรายใหม่</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("ชื่อ", lead.name)}
      ${rowHtml("โทร", link(`tel:${lead.phone}`, lead.phone))}
      ${rowHtml("อีเมล", link(`mailto:${lead.email}`, lead.email))}
      ${row("โครงการ", lead.projectName ?? `— (${lead.source})`)}
    </table>
    ${lead.message ? `<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #EEEEEE;color:#666666;font-size:13px;">${escapeHtml(lead.message.slice(0, 500))}</p>` : ""}
  `);

  const text = [
    "ผู้สนใจรายใหม่",
    `ชื่อ: ${lead.name}`,
    `โทร: ${lead.phone}`,
    `อีเมล: ${lead.email}`,
    `โครงการ: ${lead.projectName ?? `— (${lead.source})`}`,
    lead.message ? `\n${lead.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMail({
    to,
    subject: singleLine(`ผู้สนใจรายใหม่: ${lead.name}`),
    html,
    text,
  });
}

/** New RSVP — staff copy, mirrors lib/line.ts's leadCard. */
export async function notifyNewRegistrationByEmail(registration: {
  name: string;
  email: string;
  phone: string;
  agencyName: string;
  whatsapp: string | null;
  eventTitle: string;
}): Promise<void> {
  const to = staffRecipient();
  if (!to) return;

  const html = wrap(`
    <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;color:${PRIMARY};">ลงทะเบียนกิจกรรมใหม่</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("ชื่อ", registration.name)}
      ${row("บริษัท/ตัวแทน", registration.agencyName)}
      ${rowHtml("โทร", link(`tel:${registration.phone}`, registration.phone))}
      ${rowHtml("อีเมล", link(`mailto:${registration.email}`, registration.email))}
      ${registration.whatsapp ? row("WhatsApp", registration.whatsapp) : ""}
      ${row("กิจกรรม", registration.eventTitle)}
    </table>
  `);

  const text = [
    "ลงทะเบียนกิจกรรมใหม่",
    `ชื่อ: ${registration.name}`,
    `บริษัท/ตัวแทน: ${registration.agencyName}`,
    `โทร: ${registration.phone}`,
    `อีเมล: ${registration.email}`,
    registration.whatsapp ? `WhatsApp: ${registration.whatsapp}` : "",
    `กิจกรรม: ${registration.eventTitle}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendMail({
    to,
    subject: singleLine(`ลงทะเบียนกิจกรรมใหม่: ${registration.name}`),
    html,
    text,
  });
}

// ── Attendee-facing confirmation ────────────────────────────────────────

/**
 * The RSVP confirmation itself — sent to the person who just registered.
 * `locale` drives both the copy (next-intl, explicit locale — works
 * outside request scope exactly like every generateMetadata() in this
 * app) and the date/time formatting (same intlLocale() the event detail
 * page uses), so a Russian visitor gets a Russian confirmation with a
 * Russian-formatted date, not a hardcoded English one.
 */
export async function sendRsvpConfirmationEmail(args: {
  to: string;
  name: string;
  locale: string;
  eventTitle: string;
  location: string | null;
  startsAt: Date;
}): Promise<void> {
  if (!isEmailConfigured()) {
    console.info("[email] not configured — skipping RSVP confirmation");
    return;
  }

  const t = await getTranslations({
    locale: args.locale,
    namespace: "events.rsvp.confirmationEmail",
  });

  const dateFormat = new Intl.DateTimeFormat(intlLocale(args.locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat(intlLocale(args.locale), {
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = singleLine(t("subject", { event: args.eventTitle }));

  /*
    next-intl's ICU formatter substitutes values verbatim — it has no
    concept of an HTML context — so a translated string carrying a name or
    an event title needs the same escaping as a raw one. The message files
    themselves are plain text, so escaping the whole result is lossless.
  */
  const html = wrap(`
    <h1 style="margin:0 0 4px;font-size:18px;font-weight:600;color:${PRIMARY};">${escapeHtml(t("heading"))}</h1>
    <p style="margin:0 0 16px;color:#4B5563;">${escapeHtml(t("greeting", { name: args.name }))}</p>
    <p style="margin:0 0 20px;color:#4B5563;">${escapeHtml(t("intro", { event: args.eventTitle }))}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:4px;padding:4px 16px;">
      ${row(t("dateLabel"), dateFormat.format(args.startsAt))}
      ${row(t("timeLabel"), timeFormat.format(args.startsAt))}
      ${args.location ? row(t("locationLabel"), args.location) : ""}
    </table>
    <p style="margin:20px 0 0;color:#4B5563;">${escapeHtml(t("outro"))}</p>
    <p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;">${escapeHtml(t("signature"))}</p>
  `);

  const text = [
    t("heading"),
    t("greeting", { name: args.name }),
    t("intro", { event: args.eventTitle }),
    `${t("dateLabel")}: ${dateFormat.format(args.startsAt)}`,
    `${t("timeLabel")}: ${timeFormat.format(args.startsAt)}`,
    args.location ? `${t("locationLabel")}: ${args.location}` : "",
    "",
    t("outro"),
    t("signature"),
  ]
    .filter(Boolean)
    .join("\n");

  await sendMail({ to: args.to, subject, html, text });
}

/**
 * Tell a development's buyers that a new construction update is live.
 *
 * Sent one message per buyer rather than one with everyone in `to`: these
 * are customers of the same development who have no business seeing each
 * other's addresses, and a shared header would disclose the buyer list to
 * every one of them.
 *
 * Fire-and-forget like every other send here — a mail outage must not fail
 * the publish that already happened. The count of what was attempted is
 * returned so the caller can record it.
 */
export async function notifyBuyersOfProgress(args: {
  buyers: { email: string; name: string }[];
  projectName: string;
  monthLabel: string;
  percentComplete: number | null;
  summary: string | null;
  url: string;
}): Promise<number> {
  if (!isEmailConfigured() || args.buyers.length === 0) return 0;

  for (const buyer of args.buyers) {
    const html = wrap(`
      <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;color:${PRIMARY};">ความคืบหน้างานก่อสร้าง · ${escapeHtml(args.projectName)}</h1>
      <p style="margin:0 0 12px;color:#666666;font-size:14px;">เรียน ${escapeHtml(buyer.name)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${row("รอบเดือน", args.monthLabel)}
        ${args.percentComplete !== null ? row("ความคืบหน้ารวม", `${args.percentComplete}%`) : ""}
      </table>
      ${args.summary ? `<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #EEEEEE;color:#666666;font-size:13px;">${escapeHtml(args.summary.slice(0, 800))}</p>` : ""}
      <p style="margin:20px 0 0;">${link(args.url, "ดูความคืบหน้าทั้งหมด")}</p>
    `);

    const text = [
      `ความคืบหน้างานก่อสร้าง · ${args.projectName}`,
      `เรียน ${buyer.name}`,
      `รอบเดือน: ${args.monthLabel}`,
      args.percentComplete !== null
        ? `ความคืบหน้ารวม: ${args.percentComplete}%`
        : "",
      args.summary ?? "",
      args.url,
    ]
      .filter(Boolean)
      .join("\n");

    await sendMail({
      to: buyer.email,
      subject: `ความคืบหน้างานก่อสร้าง · ${args.projectName}`,
      html,
      text,
    });
  }

  return args.buyers.length;
}
