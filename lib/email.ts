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
  const email = process.env.SMTP_FROM_EMAIL || "no-reply@andamanassetsolution.com";
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

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 12px 4px 0;color:#8C9BA5;font-size:12px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:4px 0;color:#333333;font-size:13px;">${value}</td>
  </tr>`;
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
      ${row("โทร", `<a href="tel:${lead.phone}" style="color:${PRIMARY};">${lead.phone}</a>`)}
      ${row("อีเมล", `<a href="mailto:${lead.email}" style="color:${PRIMARY};">${lead.email}</a>`)}
      ${row("โครงการ", lead.projectName ?? `— (${lead.source})`)}
    </table>
    ${lead.message ? `<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #EEEEEE;color:#666666;font-size:13px;">${lead.message.slice(0, 500)}</p>` : ""}
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

  await sendMail({ to, subject: `ผู้สนใจรายใหม่: ${lead.name}`, html, text });
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
      ${row("โทร", `<a href="tel:${registration.phone}" style="color:${PRIMARY};">${registration.phone}</a>`)}
      ${row("อีเมล", `<a href="mailto:${registration.email}" style="color:${PRIMARY};">${registration.email}</a>`)}
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
    subject: `ลงทะเบียนกิจกรรมใหม่: ${registration.name}`,
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

  const t = await getTranslations({ locale: args.locale, namespace: "events.rsvp.confirmationEmail" });

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

  const subject = t("subject", { event: args.eventTitle });

  const html = wrap(`
    <h1 style="margin:0 0 4px;font-size:18px;font-weight:600;color:${PRIMARY};">${t("heading")}</h1>
    <p style="margin:0 0 16px;color:#4B5563;">${t("greeting", { name: args.name })}</p>
    <p style="margin:0 0 20px;color:#4B5563;">${t("intro", { event: args.eventTitle })}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:4px;padding:4px 16px;">
      ${row(t("dateLabel"), dateFormat.format(args.startsAt))}
      ${row(t("timeLabel"), timeFormat.format(args.startsAt))}
      ${args.location ? row(t("locationLabel"), args.location) : ""}
    </table>
    <p style="margin:20px 0 0;color:#4B5563;">${t("outro")}</p>
    <p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;">${t("signature")}</p>
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
