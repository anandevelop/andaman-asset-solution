/**
 * app/api/line/webhook/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/line/webhook — inbound events from the LINE Official Account.
 *
 * Three rules govern this endpoint, all of them from LINE's side:
 *
 *  1. Always answer 200, even for events we ignore. LINE disables a webhook
 *     that returns errors repeatedly, and losing the connection is worse
 *     than silently skipping a sticker.
 *  2. Answer fast. LINE's timeout is short, so nothing slow happens inline.
 *  3. Verify the signature against the RAW body. Reading request.json()
 *     first and re-serialising changes the bytes and breaks the HMAC — the
 *     text is read once here and parsed afterwards.
 *
 * The practical reason to run this at all is the follow/message event: it
 * carries the userId that LINE_NOTIFY_TO needs, and there is no other way
 * to discover it. Message the OA once, read the logged ID, paste it in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { fetchLineGroupName, verifyLineSignature, replyToLine } from "@/lib/line";
import { getLineConfig, recordLineChat } from "@/lib/line-config";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LineSource = {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
};

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: LineSource;
  message?: { type: string; text?: string };
};

/** The ID to paste into LINE_NOTIFY_TO for this source. */
function sourceId(source: LineSource | undefined): string | undefined {
  if (!source) return undefined;
  return source.groupId ?? source.roomId ?? source.userId;
}

const AUTO_REPLY = [
  "ขอบคุณที่ติดต่อ Andaman Asset Solution ครับ 🙏",
  "ทีมงานจะตอบกลับโดยเร็วที่สุดในเวลาทำการ",
  siteConfig.contact.officeHours.th,
  "",
  `หากเร่งด่วน โทร ${siteConfig.contact.phoneDisplay}`,
].join("\n");

export async function POST(request: Request) {
  // Raw text, not .json() — the signature is over these exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  // The secret an admin saved in the back office, else the env variable.
  const config = await getLineConfig();

  if (!verifyLineSignature(rawBody, signature, config.channelSecret)) {
    // The one case that must NOT be 200: an unsigned request is either a
    // misconfiguration or someone probing.
    //
    // Rate limited only on this path. Every HMAC costs CPU, so an
    // unauthenticated flood is a cheap way to burn ours — but a limit
    // applied before verification would throttle LINE itself during a
    // retry storm, which is exactly when the webhook must keep working.
    const ip = clientIp(request.headers);
    const limit = rateLimit(`line-webhook:${ip}`, RATE_LIMITS.webhook);

    console.warn(
      `[line/webhook] rejected request with an invalid signature ip=${ip}`,
    );

    return NextResponse.json(
      { ok: false, error: "INVALID_SIGNATURE" },
      {
        status: limit.ok ? 401 : 429,
        headers: limit.ok ? undefined : { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  let events: LineEvent[] = [];

  try {
    const parsed = JSON.parse(rawBody) as { events?: LineEvent[] };
    events = parsed.events ?? [];
  } catch {
    // Signature was valid, so this is LINE's verification ping with an
    // empty body — acknowledge it.
    return NextResponse.json({ ok: true });
  }

  for (const event of events) {
    const id = sourceId(event.source);

    switch (event.type) {
      case "follow":
        // Logged at info level on purpose: this is how an operator finds
        // the ID to configure notifications with.
        console.info(
          `[line/webhook] new follower — add to LINE_NOTIFY_TO to receive lead alerts: ${id}`,
        );
        if (event.replyToken) {
          await replyToLine(
            event.replyToken,
            "ยินดีต้อนรับสู่ Andaman Asset Solution 🌊\nสอบถามโครงการหรือนัดชมบ้านตัวอย่างได้เลยครับ",
          );
        }
        break;

      case "message":
        console.info(
          `[line/webhook] message from ${event.source?.type}:${id} — ${
            event.message?.type === "text" ? event.message.text?.slice(0, 120) : event.message?.type
          }`,
        );
        // Auto-reply to text only. Replying to a sticker with a paragraph
        // reads as a broken bot. And only in a 1:1 chat: once the OA sits in
        // the sales team's group to post lead alerts, answering every line
        // the team types there with the customer greeting would bury the
        // alerts it is there for.
        if (event.replyToken && event.message?.type === "text" && event.source?.type === "user") {
          await replyToLine(event.replyToken, AUTO_REPLY);
        }
        break;

      case "join": {
        console.info(`[line/webhook] joined ${event.source?.type} ${id}`);
        /*
          Recorded switched OFF (lib/line-config.ts): anyone can add a
          public OA to a chat, so a chat receives customers' details only
          once an admin turns it on under Settings → Integrations.
        */
        const chatType = event.source?.type === "room" ? "room" : "group";
        if (id && (chatType === "room" || event.source?.type === "group")) {
          const name =
            chatType === "group" && config.accessToken
              ? await fetchLineGroupName(id, config.accessToken)
              : "";
          await recordLineChat(id, chatType, name, "join").catch((error) =>
            console.error("[line/webhook] could not record chat", error),
          );
        }
        if (event.replyToken) {
          await replyToLine(
            event.replyToken,
            [
              "สวัสดีครับ ระบบแจ้งเตือนผู้สนใจรายใหม่ของ Andaman Asset Solution",
              "ให้แอดมินเปิดใช้ห้องนี้ที่ หลังบ้าน → ตั้งค่า → การเชื่อมต่อ → LINE",
              "แล้วการแจ้งเตือนจะเริ่มส่งเข้ามาที่นี่",
            ].join("\n"),
          );
        }
        break;
      }

      case "leave":
        console.info(`[line/webhook] leave — ${id}`);
        if (id) await recordLineChat(id, "group", "", "leave").catch(() => {});
        break;

      case "unfollow":
        console.info(`[line/webhook] ${event.type} — ${id}`);
        break;

      default:
        // Postbacks, joins, member events — nothing to do yet.
        break;
    }
  }

  return NextResponse.json({ ok: true });
}

/** LINE only ever POSTs; a GET here is someone checking the URL by hand. */
export async function GET() {
  return NextResponse.json(
    { ok: true, endpoint: "line-webhook", method: "POST" },
    { status: 200 },
  );
}
