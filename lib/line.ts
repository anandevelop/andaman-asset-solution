/**
 * lib/line.ts
 * ─────────────────────────────────────────────────────────────────────────
 * LINE Messaging API — outbound push and inbound signature verification.
 *
 * LINE is where the Phuket sales team actually lives, so a new lead landing
 * in their chat within seconds is worth more than the same lead sitting in
 * an inbox. Everything here is therefore best-effort and never blocks the
 * request that triggered it: the enquiry is already committed to Postgres
 * by the time we try to notify anyone.
 *
 * Configuration is optional throughout, and lives in lib/line-config.ts:
 * set from /admin/settings/integrations, with the LINE_* environment
 * variables as the fallback. Unconfigured, every push is a logged no-op.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getActiveRecipients,
  getLineConfig,
  lineSkipReason,
  recordLineDelivery,
  type LineDelivery,
} from "@/lib/line-config";
import { isEnabled } from "@/lib/notifications";

const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const MULTICAST_URL = "https://api.line.me/v2/bot/message/multicast";

/** LINE's own timeout is 10s; failing faster keeps the route responsive. */
const TIMEOUT_MS = 5_000;

// ── Signature verification ──────────────────────────────────────────────

/**
 * Verify the X-Line-Signature header against the raw request body.
 *
 * This is the only thing standing between the webhook and anyone on the
 * internet posting fabricated events to it, so the comparison is
 * constant-time — a plain `===` leaks how much of the signature matched,
 * which is enough to forge one given sufficient attempts.
 *
 * The body must be the raw string, byte for byte. Parsing and re-stringifying
 * JSON reorders keys and changes whitespace, which silently breaks the HMAC.
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  secret: string | null | undefined = process.env.LINE_CHANNEL_SECRET,
): boolean {

  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  // timingSafeEqual throws on a length mismatch, so check that first.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

// ── Push ────────────────────────────────────────────────────────────────

export async function isLineConfigured(): Promise<boolean> {
  return (await getActiveRecipients()) !== null;
}

export type LineSendResult = { sent: number; failed: { to: string; status: number | null; detail: string }[] };

type LineMessage = Record<string, unknown>;

/**
 * Send to every configured recipient.
 *
 * Multicast only accepts user IDs, not group or room IDs, so anything that
 * is not a `U…` is pushed individually. Getting this wrong produces a 400
 * that is easy to misread as an auth failure.
 */
async function send(
  messages: LineMessage[],
  target?: { token: string; to: string[] },
  kind: LineDelivery["kind"] = "lead",
): Promise<LineSendResult> {
  const active = target ?? (await getActiveRecipients());

  if (!active) {
    const reason = (await lineSkipReason()) ?? "NOT_CONFIGURED";
    console.info(`[line] not sending ${kind} alert: ${reason}`);
    await recordLineDelivery({ kind, outcome: "skipped", detail: reason });
    return { sent: 0, failed: [] };
  }
  const { token, to } = active;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const users = to.filter((id) => id.startsWith("U"));
  const others = to.filter((id) => !id.startsWith("U"));

  const requests: Promise<Response>[] = [];
  const labels: string[] = [];

  if (users.length > 1) {
    labels.push(users.join(","));
    requests.push(
      fetch(MULTICAST_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ to: users, messages }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
  } else {
    others.push(...users);
  }

  for (const id of others) {
    labels.push(id);
    requests.push(
      fetch(PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ to: id, messages }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
  }

  const results = await Promise.allSettled(requests);
  const outcome: LineSendResult = { sent: 0, failed: [] };

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error("[line] push failed", result.reason);
      outcome.failed.push({ to: labels[i], status: null, detail: String(result.reason) });
      continue;
    }
    if (!result.value.ok) {
      const detail = await result.value.text().catch(() => "");
      console.error(`[line] push rejected ${result.value.status}`, detail);
      outcome.failed.push({ to: labels[i], status: result.value.status, detail: detail.slice(0, 300) });
      continue;
    }
    outcome.sent += 1;
  }

  await recordLineDelivery({
    kind,
    outcome: outcome.failed.length ? "failed" : "sent",
    detail: outcome.failed.length
      ? outcome.failed.map((f) => `${f.status ?? "-"} ${f.detail}`).join(" | ")
      : `${outcome.sent}`,
  });

  return outcome;
}

// ── Message builders ────────────────────────────────────────────────────

const ACCENT = "#E8B384";

/** Where "เปิดในหลังบ้าน" points. The Thai admin, which the team uses. */
function adminLeadUrl(leadId: string): string | null {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) return null; // LINE refuses non-https URIs
  return `${base}/th/admin/leads?lead=${encodeURIComponent(leadId)}`;
}
const PRIMARY = "#083551";

function row(label: string, value: string): LineMessage {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#8C9BA5", size: "sm", flex: 2 },
      // LINE rejects the whole card for one empty text, so never send "".
      { type: "text", text: value.trim() || "—", wrap: true, color: "#333333", size: "sm", flex: 5 },
    ],
  };
}

/**
 * Flex Message with tap-to-call and tap-to-email buttons.
 *
 * The buttons are the entire point. A notification that only says "new
 * lead" makes someone open the CRM; one with the number in it gets called
 * back from the car park.
 */
function leadCard(lead: {
  title: string;
  name: string;
  email: string;
  phone: string;
  extraLabel: string;
  extra: string;
  message?: string | null;
  /** Opens the lead in the back office, where it can be taken and logged. */
  adminUrl?: string | null;
}): LineMessage {
  return {
    type: "flex",
    // Shown in the chat list and on lock screens, where Flex cannot render.
    altText: `${lead.title}: ${lead.name} · ${lead.phone}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: PRIMARY,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "ANDAMAN ASSET", color: ACCENT, size: "xxs", weight: "bold" },
          { type: "text", text: lead.title, color: "#FFFFFF", size: "lg", weight: "bold", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          row("ชื่อ", lead.name),
          row("โทร", lead.phone),
          row("อีเมล", lead.email),
          row(lead.extraLabel, lead.extra),
          ...(lead.message
            ? [
                { type: "separator", margin: "md" },
                {
                  type: "text",
                  text: lead.message.slice(0, 300),
                  wrap: true,
                  size: "sm",
                  color: "#666666",
                  margin: "md",
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...(lead.adminUrl
            ? [
                {
                  type: "button",
                  style: "primary",
                  color: ACCENT,
                  height: "sm",
                  action: { type: "uri", label: "เปิดในหลังบ้าน", uri: lead.adminUrl },
                },
              ]
            : []),
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
          {
            type: "button",
            style: "primary",
            color: PRIMARY,
            height: "sm",
            action: { type: "uri", label: "โทรกลับ", uri: `tel:${lead.phone}` },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "uri", label: "อีเมล", uri: `mailto:${lead.email}` },
          },
            ],
          },
        ],
      },
    },
  };
}

/** New enquiry from the lead form. */
export async function notifyNewLead(lead: {
  id?: string;
  name: string;
  email: string;
  phone: string;
  message: string | null;
  projectName: string | null;
  source: string;
}): Promise<void> {
  try {
    // The LINE switch for this event on /admin/settings/notifications.
    if (!(await isEnabled("newLead", "line"))) {
      await recordLineDelivery({ kind: "lead", outcome: "skipped", detail: "EVENT_OFF" });
      return;
    }
    await send([
      leadCard({
        title: "ผู้สนใจรายใหม่",
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        extraLabel: "โครงการ",
        extra: lead.projectName ?? `— (${lead.source})`,
        message: lead.message,
        adminUrl: lead.id ? adminLeadUrl(lead.id) : null,
      }),
    ]);
  } catch (error) {
    // Never propagate: the lead is already saved.
    console.error("[line] notifyNewLead failed", error);
  }
}

/** New RSVP from an event page. */
export async function notifyNewRegistration(registration: {
  name: string;
  email: string;
  phone: string;
  agencyName: string;
  whatsapp: string | null;
  eventId: string;
}): Promise<void> {
  try {
    if (!(await isEnabled("eventRegistration", "line"))) {
      await recordLineDelivery({ kind: "registration", outcome: "skipped", detail: "EVENT_OFF" });
      return;
    }
    await send([
      leadCard({
        title: "ลงทะเบียนกิจกรรมใหม่",
        name: registration.name,
        email: registration.email,
        phone: registration.phone,
        extraLabel: "บริษัท/ตัวแทน",
        extra: registration.agencyName,
        message: registration.whatsapp ? `WhatsApp: ${registration.whatsapp}` : null,
      }),
    ], undefined, "registration");
  } catch (error) {
    console.error("[line] notifyNewRegistration failed", error);
  }
}

/** Plain reply to an inbound webhook message. */
export async function replyToLine(replyToken: string, text: string): Promise<void> {
  const token = (await getLineConfig()).accessToken;
  if (!token) return;

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[line] reply rejected ${response.status}`);
    }
  } catch (error) {
    console.error("[line] reply failed", error);
  }
}

// ── Back office ─────────────────────────────────────────────────────────

/** The OA behind a token, or null when LINE refuses the token. */
export async function fetchLineBotInfo(
  token: string,
): Promise<{ displayName: string; basicId: string; pictureUrl?: string } | null> {
  try {
    const response = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as { displayName: string; basicId: string; pictureUrl?: string };
  } catch {
    return null;
  }
}

/** A group's display name, so the back office can say which chat it is. */
export async function fetchLineGroupName(groupId: string, token: string): Promise<string> {
  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "";
    return ((await response.json()) as { groupName?: string }).groupName ?? "";
  } catch {
    return "";
  }
}

/** "Send a test" on the integrations page: to one chat, or to all enabled. */
export async function sendLineTest(onlyTo?: string): Promise<LineSendResult | { error: "NO_TOKEN" | "NO_RECIPIENTS" }> {
  const config = await getLineConfig();
  if (!config.accessToken) return { error: "NO_TOKEN" };
  const to = onlyTo ? [onlyTo] : config.destinations.filter((d) => d.enabled).map((d) => d.id);
  if (to.length === 0) return { error: "NO_RECIPIENTS" };

  /*
    The test sends a sample lead card as well as the text, built by the
    same leadCard() a real enquiry uses. A text-only test proved the token
    and the chat but not the card: if LINE refused the card's layout, every
    real alert failed while the test still passed.
  */
  return send(
    [
      {
        type: "text",
        text: "✅ ทดสอบการแจ้งเตือนจากหลังบ้าน Andaman Asset Solution\nห้องนี้จะได้รับการแจ้งเตือนเมื่อมีผู้สนใจรายใหม่ — ตัวอย่างการ์ด:",
      },
      leadCard({
        title: "ผู้สนใจรายใหม่ (ตัวอย่าง)",
        name: "ตัวอย่าง ทดสอบ",
        email: "test@example.com",
        phone: "+66812345678",
        extraLabel: "โครงการ",
        extra: "The Trinity Village",
        message: "ข้อความตัวอย่างจากการทดสอบในหลังบ้าน",
        adminUrl: adminLeadUrl("test"),
      }),
    ],
    { token: config.accessToken, to },
    "test",
  );
}

/**
 * A short alert card for the scheduled jobs (lib/scheduled-alerts.ts):
 * a title, label/value rows and one button into the back office. Never
 * throws; the outcome lands in the delivery log like every other alert.
 */
export async function pushLineAlert(alert: {
  kind: "unclaimed" | "reservation" | "weekly" | "backup" | "pagespeed" | "error";
  title: string;
  rows: [string, string][];
  url: string;
  urlLabel: string;
}): Promise<void> {
  try {
    const https = /^https:\/\//.test(alert.url);
    await send(
      [
        {
          type: "flex",
          altText: `${alert.title}: ${alert.rows.map(([, v]) => v).join(" · ")}`.slice(0, 400),
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: PRIMARY,
              paddingAll: "14px",
              contents: [
                { type: "text", text: "ANDAMAN ASSET", color: ACCENT, size: "xxs", weight: "bold" },
                { type: "text", text: alert.title, color: "#FFFFFF", size: "md", weight: "bold", margin: "sm", wrap: true },
              ],
            },
            body: { type: "box", layout: "vertical", spacing: "md", contents: alert.rows.map(([l, v]) => row(l, v)) },
            ...(https
              ? {
                  footer: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                      {
                        type: "button",
                        style: "primary",
                        color: PRIMARY,
                        height: "sm",
                        action: { type: "uri", label: alert.urlLabel.slice(0, 20), uri: alert.url },
                      },
                    ],
                  },
                }
              : {}),
          },
        },
      ],
      undefined,
      alert.kind,
    );
  } catch (error) {
    console.error(`[line] ${alert.kind} alert failed`, error);
  }
}
