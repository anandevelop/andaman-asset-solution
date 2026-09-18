/**
 * app/api/not-found/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/not-found — called client-side from the [locale] not-found
 * boundary (app/[locale]/not-found.tsx) with the path that just 404'd.
 *
 * Two things happen, in order:
 *   1. Check for an active Redirect covering that path. Found ⇒ the
 *      client-side boundary sends the visitor on immediately instead of
 *      leaving them on a dead end.
 *   2. Not found ⇒ upsert a NotFoundHit counter, the admin's worklist for
 *      "what should probably become a Redirect" (see that model's comment
 *      in prisma/schema.prisma).
 *
 * Why this lives behind a client-side fetch rather than a server-side
 * lookup inside not-found.tsx itself: that file is deliberately a client
 * component (see its own header) specifically because reading the request
 * inside a not-found boundary previously turned a static route's stale
 * link into a 500 — "Page changed from static to dynamic at runtime,
 * reason: headers". Doing the DB lookup here, from an ordinary Route
 * Handler hit by a plain fetch(), sidesteps that failure mode entirely.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { PathHitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { countPathHit } from "@/lib/redirects";
import { isDatabaseOfflineError } from "@/lib/db";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { locales } from "@/i18n";

const RATE_LIMIT = RATE_LIMITS.notFound;

const bodySchema = z.object({
  // The full pathname as the browser saw it, locale segment included —
  // stripped below before it is used as a lookup key, since Redirect rows
  // are locale-relative (one row covers all four locales at once).
  path: z.string().trim().min(1).max(500),
});

/** "/th/projects/old-slug" → "/projects/old-slug". */
function stripLocale(path: string): string {
  const match = path.match(new RegExp(`^/(${locales.join("|")})(/.*|$)`));
  if (!match) return path;
  return match[2] || "/";
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`not-found:${ip}`, RATE_LIMIT);

  if (!limit.ok) {
    return NextResponse.json({ redirectTo: null }, { status: 429 });
  }

  let path: string;
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    path = stripLocale(parsed.data.path);
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const redirect = await prisma.redirect.findUnique({
      where: { fromPath: path },
      // expiresAt so a campaign redirect that has run out answers the same
      // way here as it does in lib/redirects.ts — one of them saying the
      // link still works would be worse than either answer alone.
      select: { toPath: true, statusCode: true, isActive: true, expiresAt: true },
    });

    const expired = redirect?.expiresAt !== null && redirect?.expiresAt !== undefined
      && redirect.expiresAt.getTime() <= Date.now();

    if (redirect?.isActive && !expired) {
      // Fire-and-forget: a visitor waiting on their redirect should not
      // wait on this write too.
      void prisma.redirect
        .update({
          where: { fromPath: path },
          data: { hits: { increment: 1 }, lastHitAt: new Date() },
        })
        .catch(() => {});

      countPathHit(PathHitKind.REDIRECT, path);

      return NextResponse.json({ redirectTo: redirect.toPath });
    }

    // No redirect covers this path — log it as a candidate for one. Best
    // effort: a failed upsert here must never surface as an error to a
    // visitor who has already hit a dead end.
    const referer = request.headers.get("referer");
    await prisma.notFoundHit
      .upsert({
        where: { path },
        create: { path, referer, hits: 1 },
        update: { hits: { increment: 1 }, lastHitAt: new Date(), referer },
      })
      .catch(() => {});

    // The rolling half of the same count. Redirect.hits and
    // NotFoundHit.hits answer "has this ever happened"; PathHitDay answers
    // "is it still happening", which is what the admin's 30-day columns
    // read. Both are written here or neither number is true.
    countPathHit(PathHitKind.NOT_FOUND, path);

    return NextResponse.json({ redirectTo: null });
  } catch (error) {
    if (isDatabaseOfflineError(error)) {
      return NextResponse.json({ redirectTo: null });
    }
    throw error;
  }
}
