/**
 * lib/seo/cron-auth.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who is allowed to trigger a scheduled job.
 *
 * Every /api/cron/* route is a URL on the public internet that does real
 * work — an audit walks every page on the site and writes a few hundred
 * rows. Without a check, anyone who guesses the path can run it as often as
 * they like, which is a denial of service with extra steps.
 *
 * Shared rather than written per route because phases 1, 4 and 5 each add
 * one, and three slightly different opinions about what counts as
 * authenticated is how the weakest of them becomes the way in.
 *
 * NO SECRET MEANS NO ACCESS
 *
 * When CRON_SECRET is unset the answer is always no. The alternative —
 * "unconfigured means open" — turns a forgotten environment variable on one
 * deployment into an open endpoint, and a forgotten variable is the single
 * most likely thing to go wrong here. lib/env.ts warns about it at boot for
 * exactly this reason.
 *
 * TIMING
 *
 * Compared with timingSafeEqual. A === on a secret leaks its length and
 * then its prefix to anybody patient enough to measure, and the whole
 * comparison costs a microsecond either way.
 *
 * ACCEPTED SHAPES
 *
 * `Authorization: Bearer <secret>`, which is what a scheduler sends, and
 * `?secret=` for the platforms that cannot set a header. The query form is
 * the weaker of the two — it lands in access logs — so it is accepted but
 * noted here rather than documented as the normal way in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { timingSafeEqual } from "node:crypto";

export type CronAuthResult = { ok: true } | { ok: false; reason: "unconfigured" | "denied" };

/** Constant-time, and safe on differing lengths — timingSafeEqual throws
 *  when the buffers differ, which would itself be a length oracle. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Exported separately from the request-reading wrapper so a test can pin
 * the comparison without building a Request.
 */
export function isAuthorisedCron(provided: string | null, expected: string | undefined): CronAuthResult {
  const secret = expected?.trim();
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (!provided) return { ok: false, reason: "denied" };

  return secretMatches(provided, secret) ? { ok: true } : { ok: false, reason: "denied" };
}

/** The secret this request presented, from either accepted shape. */
export function readCronSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim() || null;

  try {
    return new URL(request.url).searchParams.get("secret");
  } catch {
    return null;
  }
}

/**
 * The one line every cron route starts with.
 *
 * Returns a Response to send back when the caller is not allowed, or null
 * when it is — so a route reads `const denied = guardCron(request); if
 * (denied) return denied;` and cannot accidentally continue past a failure
 * the way an `if (!ok) { }` with a missing return can.
 *
 * 401 in both failure cases, and deliberately the same body: telling an
 * anonymous caller "this endpoint has no secret configured" is telling them
 * which deployment to come back to.
 */
export function guardCron(request: Request): Response | null {
  const result = isAuthorisedCron(readCronSecret(request), process.env.CRON_SECRET);
  if (result.ok) return null;

  if (result.reason === "unconfigured") {
    // Worth one line in the server log: the job is silently not running,
    // and the person who notices will be looking here.
    console.warn("[cron] refused: CRON_SECRET is not set on this deployment");
  }

  return new Response(JSON.stringify({ ok: false, error: "UNAUTHORISED" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
