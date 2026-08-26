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
 * Configuration is optional throughout. Without LINE_CHANNEL_ACCESS_TOKEN
 * and LINE_NOTIFY_TO, every push is a logged no-op.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

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
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;

  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  // timingSafeEqual throws on a length mismatch, so check that first.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

// ── Push ────────────────────────────────────────────────────────────────

function recipients(): string[] {
  return (process.env.LINE_NOTIFY_TO ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isLineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN) && recipients().length > 0;
}

type LineMessage = Record<string, unknown>;

/**
 * Send to every configured recipient.
 *
 * Multicast only accepts user IDs, not group or room IDs, so anything that
 * is not a `U…` is pushed individually. Getting this wrong produces a 400
 * that is easy to misread as an auth failure.
 */
async function send(messages: LineMessage[]): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = recipients();

  if (!token || to.length === 0) {
    console.info("[line] not configured — skipping notification");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const users = to.filter((id) => id.startsWith("U"));
  const others = to.filter((id) => !id.startsWith("U"));

  const requests: Promise<Response>[] = [];

  if (users.length > 1) {
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

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[line] push failed", result.reason);
      continue;
    }
    if (!result.value.ok) {
      const detail = await result.value.text().catch(() => "");
      console.error(`[line] push rejected ${result.value.status}`, detail);
    }
  }
}

// ── Message builders ────────────────────────────────────────────────────

const ACCENT = "#E8B384";
const PRIMARY = "#083551";

function row(label: string, value: string): LineMessage {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#8C9BA5", size: "sm", flex: 2 },
      { type: "text", text: value, wrap: true, color: "#333333", size: "sm", flex: 5 },
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
    },
  };
}

/** New enquiry from the lead form. */
export async function notifyNewLead(lead: {
  name: string;
  email: string;
  phone: string;
  message: string | null;
  projectName: string | null;
  source: string;
}): Promise<void> {
  try {
    await send([
      leadCard({
        title: "ผู้สนใจรายใหม่",
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        extraLabel: "โครงการ",
        extra: lead.projectName ?? `— (${lead.source})`,
        message: lead.message,
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
  partySize: number;
  eventId: string;
}): Promise<void> {
  try {
    await send([
      leadCard({
        title: "ลงทะเบียนกิจกรรมใหม่",
        name: registration.name,
        email: registration.email,
        phone: registration.phone,
        extraLabel: "จำนวน",
        extra: `${registration.partySize} คน`,
      }),
    ]);
  } catch (error) {
    console.error("[line] notifyNewRegistration failed", error);
  }
}

/** Plain reply to an inbound webhook message. */
export async function replyToLine(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
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
