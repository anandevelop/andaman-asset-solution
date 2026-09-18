/**
 * app/api/revalidate/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/revalidate — purge the ISR cache for specific paths or tags.
 *
 * ⚠ The admin does NOT use this, deliberately.
 *
 * Server actions call `revalidatePath` directly and synchronously. Routing
 * them through an HTTP request to our own server would add a network hop,
 * a shared secret, and a second failure mode — for behaviour that already
 * works in-process. If a publish stops refreshing the public page, the bug
 * is in the action, not here.
 *
 * What this endpoint is for is callers that have no other way in:
 *
 *   • a CI job after a data migration or a bulk import
 *   • a webhook from an external system that changed the database
 *   • an operator clearing a specific stale page by hand
 *
 * Authentication is a shared secret rather than a session, because none of
 * those callers has one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { locales } from "@/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Purging is cheap but not free — each call forces the next visitor to
 * re-render. A tight limit stops an leaked secret becoming a way to keep
 * the cache permanently cold.
 */
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * Path prefixes that may be revalidated.
 *
 * Without an allowlist, a caller could pass "/" with type "layout" and
 * invalidate every rendered page on the site in one request. These are the
 * public routes that actually have cached content.
 */
const ALLOWED_PREFIXES = [
  "",
  "/projects",
  "/progress",
  "/news",
  "/events",
  "/about",
  // Renders awards and has its own hour-long window, so it is exactly the
  // kind of page this escape hatch is for. Its absence meant the one route
  // that could not be purged by hand was one of the slowest to refresh.
  "/achievements",
  // The brochure catalogue and every /e-brochure/<slug> under it. Same
  // hour-long window, and a replaced PDF is exactly the edit an operator
  // wants live immediately rather than up to an hour later.
  "/e-brochure",
  "/contact",
] as const;

const bodySchema = z.object({
  /**
   * Locale-relative paths, e.g. "/projects/trinity-village". Each is
   * expanded across every locale — a caller should not have to know the
   * site is bilingual.
   */
  paths: z.array(z.string().trim().max(300)).max(50).optional(),
  tags: z.array(z.string().trim().max(120)).max(20).optional(),
});

/** Constant-time compare, so a wrong secret leaks nothing about the right one. */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;

  if (!expected || !provided) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);

  // timingSafeEqual throws on a length mismatch.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/** True when `path` sits under one of the allowed prefixes. */
function isAllowedPath(path: string): boolean {
  // Reject traversal and protocol-relative values outright.
  if (path.includes("..") || path.startsWith("//")) return false;
  if (path !== "" && !path.startsWith("/")) return false;

  return ALLOWED_PREFIXES.some((prefix) => {
    /*
      The root entry matches the home page only.

      Treating "" as a prefix would make the check `path.startsWith("/")`,
      which is true of every absolute path — including /admin and /api. The
      allowlist would have looked correct while permitting everything, which
      is the failure mode it exists to prevent.
    */
    if (prefix === "") return path === "";

    // Exact match, or a child. `${prefix}/` is what stops "/news" from
    // also matching "/news-archive".
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`revalidate:${ip}`, RATE_LIMIT);

  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!process.env.REVALIDATE_SECRET) {
    // Not configured is not the same as forbidden — say so, so an operator
    // knows to set the variable rather than hunting a wrong secret.
    return NextResponse.json({ ok: false, error: "NOT_CONFIGURED" }, { status: 501 });
  }

  if (!secretMatches(request.headers.get("x-revalidate-secret"))) {
    console.warn(`[revalidate] rejected request with a bad secret ip=${ip}`);
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION_FAILED" }, { status: 422 });
  }

  const { paths = [], tags = [] } = parsed.data;

  if (paths.length === 0 && tags.length === 0) {
    return NextResponse.json({ ok: false, error: "NOTHING_TO_DO" }, { status: 400 });
  }

  const revalidated: string[] = [];
  const rejected: string[] = [];

  for (const path of paths) {
    // Normalise "/" to "" so it matches the root prefix.
    const normalised = path === "/" ? "" : path.replace(/\/+$/, "");

    if (!isAllowedPath(normalised)) {
      rejected.push(path);
      continue;
    }

    for (const locale of locales) {
      const full = `/${locale}${normalised}`;
      revalidatePath(full);
      revalidated.push(full);
    }
  }

  for (const tag of tags) {
    /* "max" is the shortest way to say "this entry is stale now". Next 16
       made the profile argument required; updateTag would be the more
       direct call, but it is only legal inside a Server Action and this is
       a route handler answering an external trigger. */
    revalidateTag(tag, "max");
    revalidated.push(`tag:${tag}`);
  }

  return NextResponse.json(
    {
      ok: true,
      revalidated,
      // Reported rather than failing the whole request: a caller purging
      // twelve paths should not lose eleven of them to one typo.
      ...(rejected.length > 0 ? { rejected } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
