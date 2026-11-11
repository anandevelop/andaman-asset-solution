/**
 * app/api/click/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/click — "somebody pressed call / LINE / WhatsApp / … on this
 * page", with the source their visit came from. Sent by
 * lib/analytics/visit-origin.ts's sendClick().
 *
 * Same rules as /api/page-view: always 204, never an error a visitor could
 * see, rate limited per IP, and nothing stored that could identify anyone —
 * a day, an action, a path, a source and a number.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseOfflineError } from "@/lib/db";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isCountablePublicPath, stripLocale } from "@/lib/public-paths";
import { CLICK_ACTIONS } from "@/lib/analytics/click-actions";
import { visitOriginSchema } from "@/lib/analytics/origin-schema";
import { recordClick } from "@/lib/analytics/traffic-store";
import { isBot } from "@/lib/seo/bots";

const bodySchema = z.object({
  action: z.enum(CLICK_ACTIONS),
  path: z.string().trim().min(1).max(500),
  origin: visitOriginSchema.optional(),
});

export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });

  const ip = clientIp(request.headers);
  if (!rateLimit(`click:${ip}`, RATE_LIMITS.click).ok) return done;
  if (isBot(request.headers.get("user-agent"))) return done;

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return done;
    body = parsed.data;
  } catch {
    return done;
  }

  const path = stripLocale(body.path);
  if (!isCountablePublicPath(path)) return done;

  try {
    await recordClick(body.action, path, body.origin ?? visitOriginSchema.parse({}));
  } catch (error) {
    if (!isDatabaseOfflineError(error)) console.error("[click] failed to record", error);
  }
  return done;
}
