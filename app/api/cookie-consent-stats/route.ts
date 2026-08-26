/**
 * app/api/cookie-consent-stats/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cookie-consent-stats — fired once by lib/cookie-consent.ts's
 * writeConsent() every time a visitor makes a banner decision.
 *
 * Anonymous by design: the body is only { analytics, marketing }, there is
 * no visitor id, and nothing here is tied back to a request's IP or cookies.
 * See lib/cookie-consent-stats.ts for why that matters under PDPA.
 *
 * 204 on success either way (even when the write itself failed) — a stats
 * counter must never surface an error to a visitor who was just trying to
 * close a cookie banner.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { cookieConsentStatsSchema } from "@/lib/validations";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { recordCookieConsentDecision } from "@/lib/cookie-consent-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`cookie-consent-stats:${ip}`, RATE_LIMITS.cookieConsent);

  if (!limit.ok) {
    // Not worth telling the client — writeConsent() ignores the response.
    return new NextResponse(null, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = cookieConsentStatsSchema.safeParse(payload);
  if (!parsed.success) {
    return new NextResponse(null, { status: 422 });
  }

  try {
    await recordCookieConsentDecision(parsed.data);
  } catch (error) {
    // Database offline or otherwise unavailable — log and move on. This
    // counter is a nice-to-have for the weekly report, not load-bearing for
    // anything a visitor is doing right now.
    console.error("[POST /api/cookie-consent-stats] failed to record", error);
  }

  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
