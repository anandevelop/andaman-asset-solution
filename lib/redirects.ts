/**
 * lib/redirects.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Looking up one path in the Redirect table, and counting the hit.
 *
 * Used from three places, all server-side: the four content detail pages
 * that already know they are about to 404 a renamed slug, the catch-all
 * route that answers every other unmatched path (app/[locale]/[...rest]),
 * and app/api/not-found/route.ts, which covers a notFound() thrown from
 * somewhere neither of those reaches.
 *
 * ON THE STATUS CODE
 *
 * A row says 301 or 302 because that is what the people configuring it
 * mean and what every SEO article they will read calls it. What actually
 * goes on the wire is 308 and 307 — Next's permanentRedirect() and
 * redirect() emit those, and unlike 301/302 they are defined not to let a
 * client rewrite a POST into a GET. Google's documentation lists 308 and
 * 301 together as permanent signals and treats them identically for
 * consolidating a URL, so the SEO meaning the admin picked is the SEO
 * meaning that gets sent. The admin screen says so rather than leaving
 * somebody to discover it in a network tab.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { permanentRedirect, redirect } from "next/navigation";
import { PathHitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

export type ResolvedRedirect = {
  /** Locale-relative target, e.g. "/projects/new-slug". */
  toPath: string;
  /** 301 or 302, as configured. See the note above on what is sent. */
  statusCode: number;
};

/** Midnight UTC for `day`, the grain PathHitDay is keyed on. */
export function hitDay(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export type ChainWalk = { path: string[]; loop: boolean };

/**
 * Walks a fromPath→toPath table starting at `start`. `path` is the ordered
 * nodes visited, beginning with `start`; `loop` is true if the walk
 * revisited a node or ran past `maxHops`.
 *
 * Built for lib/admin/link-health.ts's findRedirectChains() reporting —
 * only ever called with `start` = a real existing redirect's own fromPath,
 * where a revisit of `start` itself is exactly the loop this is meant to
 * catch.
 *
 * NOT used by this file's own callers, and deliberately not plugged into
 * app/[locale]/admin/(growth)/seo/urls/actions.ts's chainProblem(): that
 * function seeds its own loop-detection set with the *edit's own*
 * fromPath and walks from toPath, so it catches a chain that cycles back
 * to the fromPath being edited — a case a generic walker seeded only with
 * `start` cannot reproduce without also being told about that second,
 * separate node. chainProblem keeps its own independent implementation
 * rather than being bent to share this one.
 */
export function walkRedirectChain(table: Map<string, string>, start: string, maxHops = 10): ChainWalk {
  const path = [start];
  const seen = new Set([start]);
  let current = start;

  for (let step = 0; step < maxHops; step += 1) {
    const next = table.get(current);
    if (!next) return { path, loop: false };

    path.push(next);
    if (seen.has(next)) return { path, loop: true };

    seen.add(next);
    current = next;
  }

  return { path, loop: true };
}

/**
 * Bump both counters for a path: the lifetime one on its own row, and the
 * day bucket the 30-day figures are summed from.
 *
 * Fire-and-forget by design — a visitor being sent somewhere must never
 * wait on bookkeeping, and a failed count must never turn a working
 * redirect into an error page.
 */
export function countPathHit(kind: PathHitKind, path: string): void {
  const day = hitDay();

  void prisma.pathHitDay
    .upsert({
      where: { kind_path_day: { kind, path, day } },
      create: { kind, path, day, hits: 1 },
      update: { hits: { increment: 1 } },
    })
    .catch(() => {});
}

/**
 * `path` is locale-relative, e.g. "/projects/old-slug". Returns the target
 * and the configured status, or null when no live redirect covers this
 * path — inactive, expired, or simply absent, and also when the database
 * is unreachable, because a missing redirect must never turn into a 500 on
 * top of what was already going to be a 404.
 */
export async function resolveRedirect(path: string): Promise<ResolvedRedirect | null> {
  // `row`, not `redirect` — the name belongs to next/navigation's helper,
  // imported above and used a few lines down.
  const row = await safeQuery(
    "redirects:resolve",
    () =>
      prisma.redirect.findUnique({
        where: { fromPath: path },
        select: { toPath: true, statusCode: true, isActive: true, expiresAt: true },
      }),
    null,
  );

  if (!row?.isActive) return null;

  // Expiry is checked here rather than by a job, because there is no job.
  // See the field comment on Redirect.expiresAt.
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  void prisma.redirect
    .update({ where: { fromPath: path }, data: { hits: { increment: 1 }, lastHitAt: new Date() } })
    .catch(() => {});

  countPathHit(PathHitKind.REDIRECT, path);

  return { toPath: row.toPath, statusCode: row.statusCode };
}

/**
 * The whole "has this moved?" step, for a page that has just failed to
 * find its record: send the visitor on if a redirect covers the path, and
 * return if nothing does so the caller can call notFound().
 *
 * Both functions here throw rather than return — that is how Next's
 * navigation helpers signal a redirect — so nothing after the call in the
 * moved case ever runs.
 */
export async function redirectIfMoved(locale: string, path: string): Promise<void> {
  const target = await resolveRedirect(path);
  if (!target) return;

  const destination = `/${locale}${target.toPath}`;

  // 301 → 308, 302 → 307. See the header on why the row says one and the
  // wire carries the other.
  if (target.statusCode === 301) permanentRedirect(destination);
  redirect(destination);
}
