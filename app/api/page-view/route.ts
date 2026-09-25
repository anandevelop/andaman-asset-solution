/**
 * app/api/page-view/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/page-view — "somebody read this page today."
 *
 * WHY THIS EXISTS WHEN THE SITE ALREADY HAS GOOGLE ANALYTICS
 *
 * GA knows the traffic; nothing in this application can read it back.
 * Reading it would need the GA Data API, a service account and an OAuth
 * connection nobody has set up. The article list needs a view count beside
 * its lead count — that pairing is the whole point of the screen, "which
 * article brings customers, not just readers" — and a number the admin
 * cannot see is no use to it. So the one figure that screen needs is
 * counted here, in the database it already reads.
 *
 * WHY A BEACON RATHER THAN A COUNT ON THE SERVER
 *
 * Article pages carry `revalidate = 3600`; they are rendered once an hour
 * and served from cache. A count inside the page component would tick once
 * per regeneration — about 24 a day whatever the traffic. Counting from
 * the browser is the only place that sees every reader.
 *
 * WHAT IS STORED
 *
 * Two things, both deliberately forgetful.
 *
 * PathHitDay is one row per path per day with a number on it. No IP, no
 * identifier, no session, nothing that could reconstruct one person's
 * reading history — the screen asks "how many", so "how many" is all that
 * is kept.
 *
 * LiveVisit (phase 3) is one row per visit *in the last fifteen minutes*,
 * updated in place as it moves and deleted by the next write once it goes
 * quiet. It needs something stable per visit to update, which is a one-way
 * salted hash of IP and user agent — the IP itself never leaves this
 * handler. See lib/analytics/live-visit.ts for why the salt falls back to a
 * per-process random value rather than to nothing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { PathHitKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isDatabaseOfflineError } from "@/lib/db";
import { hitDay } from "@/lib/redirects";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isCountablePublicPath, stripLocale } from "@/lib/public-paths";
import { recordLiveVisit, visitHash } from "@/lib/analytics/live-visit";
import { localeOf } from "@/lib/analytics/locale-of";

/*
  Which paths are counted now lives in lib/public-paths.ts —
  isCountablePublicPath(). It used to be the single prefix "/news/", which
  kept the table small by ignoring most of the site; phase 3 wants every
  public page, and the file that already knows the site's shape is the one
  that should say what "public" means.

  Still not a security measure, and still quiet: anything else is accepted
  and ignored, so a page that starts sending beacons before that list knows
  about it fails silently rather than 400ing in a reader's console.
*/

const bodySchema = z.object({
  path: z.string().trim().min(1).max(500),
  /** Milliseconds on the current page, from the browser's own clock. Only
   *  a heartbeat carries one; the first beacon of a page has nothing to
   *  report yet. */
  dwellMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  /** True for the 15-second heartbeat, false/absent for the first beacon
   *  of a page. A heartbeat must not count a second read of the page. */
  heartbeat: z.boolean().optional(),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (!rateLimit(`page-view:${ip}`, RATE_LIMITS.pageView).ok) {
    return new NextResponse(null, { status: 204 });
  }

  let path: string;
  let locale: string;
  let dwellMs = 0;
  let heartbeat = false;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return new NextResponse(null, { status: 204 });
    path = stripLocale(parsed.data.path);
    locale = localeOf(parsed.data.path);
    dwellMs = parsed.data.dwellMs ?? 0;
    heartbeat = parsed.data.heartbeat ?? false;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  if (!isCountablePublicPath(path)) {
    return new NextResponse(null, { status: 204 });
  }

  /*
    Who is here now. Separate from the day counter below and failing
    separately: a problem writing this must not cost the read count, and
    neither is worth an error in a reader's console.
  */
  try {
    await recordLiveVisit({
      hash: visitHash(ip, request.headers.get("user-agent") ?? ""),
      path,
      locale,
      dwellMs,
    });
  } catch (error) {
    if (!isDatabaseOfflineError(error)) {
      console.error("[page-view] failed to record live visit", error);
    }
  }

  // A heartbeat is the same reader still reading. Counting it would turn
  // the read count into a measure of how long people stay.
  if (heartbeat) return new NextResponse(null, { status: 204 });

  try {
    // Awaited rather than fired and forgotten: this handler has nothing
    // else to do, and an un-awaited write in a serverless request can be
    // cut off when the response is returned.
    await prisma.pathHitDay.upsert({
      where: {
        kind_path_day: { kind: PathHitKind.PAGE_VIEW, path, day: hitDay() },
      },
      create: { kind: PathHitKind.PAGE_VIEW, path, day: hitDay(), hits: 1 },
      update: { hits: { increment: 1 } },
    });
  } catch (error) {
    // A reader must never see anything go wrong because a counter did.
    if (!isDatabaseOfflineError(error)) {
      console.error("[page-view] failed to record", error);
    }
  }

  return new NextResponse(null, { status: 204 });
}
