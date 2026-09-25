/**
 * app/[locale]/admin/(growth)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The SEO & Growth zone — sitewide SEO today; analytics joins it in a
 * later phase, landing here automatically since a route group is a
 * filesystem detail, not something a new sibling folder has to opt into.
 *
 * Role.ADMIN is the floor: URLs, redirects and structured data are the
 * kind of change that is bad rather than catastrophic to get wrong, but
 * still not a thing to hand to every content editor by default.
 *
 * THE EXCEPTION SLOT, CURRENTLY EMPTY
 *
 * Every other admin zone answers "which zone is this?" and stops there —
 * one guard, one minimum, for everything inside it. This zone could not,
 * for exactly one route: /seo/translations was aimed at content editors —
 * they are the people who know which language is missing what — while
 * everything else here (redirects, structured data, the URL health
 * report) genuinely wants ADMIN. Widening the whole zone to EDITOR to fit
 * one screen would have handed every editor the redirect table too.
 *
 * That screen has since moved to /admin/publishing/translations, where
 * EDITOR is the unremarkable floor and no exception is needed, and the
 * entry went with it. Which is the outcome the exception was always a
 * stand-in for: it was loosening a zone around a screen filed in the
 * wrong zone, and the real fix was to file it correctly.
 *
 * ROUTE_EXCEPTIONS stays, empty. Not because something is expected to
 * need it — it is deliberately hard to earn a place in it — but because
 * deleting the mechanism would delete the rules around it: that an entry
 * may only ever loosen, that the match is segment-aware, and that a
 * missing header fails closed. The next route that genuinely needs an
 * exception would otherwise get a fresh, unreviewed version of all three.
 * tests/admin/growth-route-exceptions.test.ts drives those rules against
 * a fixture rather than against whatever happens to be in the array.
 *
 * HOW THE MATCH WORKS, AND WHY IT CAN ONLY EVER LOOSEN
 *
 * The pathname comes from the `x-admin-pathname` header proxy.ts sets on
 * every /admin request — a layout is never handed the URL it is wrapping,
 * only `params` (the dynamic segments), and "/seo/translations" has none.
 * See the comment in proxy.ts for exactly how that header survives being
 * handed to next-intl's own middleware afterwards.
 *
 * If the header is ever missing — the request came from somewhere that
 * does not set it, a future refactor of proxy.ts drops it — `pathname`
 * comes back `null`, no exception matches, and every route in the zone
 * falls back to Role.ADMIN. An exception that fails to identify its route
 * has to fail closed, not open: the alternative is a header this layout
 * trusts silently becoming the only thing standing between an editor and
 * the redirect table.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";

export type RouteException = {
  /** Locale-relative, under this zone's own base — "/seo/keywords",
   *  never the full "/en/admin/seo/keywords". */
  prefix: string;
  /** Must be looser than Role.ADMIN — this slot exists to loosen the
   *  zone's floor for one route, never to tighten it. */
  minimum: Role;
};

/** Empty, and see the header for why the mechanism around it stays. */
export const ROUTE_EXCEPTIONS: readonly RouteException[] = [];

/**
 * Pick the exception covering `relative`, or undefined.
 *
 * Exported so its rules can be tested with a fixture: the array above is
 * empty today, and a test that could only drive it through the live array
 * would silently stop checking anything the moment it emptied — leaving
 * the next entry added to it completely unexercised.
 *
 * Segment-aware, not a bare startsWith: "/seo/keywords-export" is a
 * different route from "/seo/keywords" and must not inherit its exception
 * just because the two strings share a prefix.
 */
export function exceptionFor(
  relative: string | null,
  exceptions: readonly RouteException[] = ROUTE_EXCEPTIONS,
): RouteException | undefined {
  return exceptions.find(
    (candidate) => relative === candidate.prefix || relative?.startsWith(`${candidate.prefix}/`),
  );
}

/** The part of x-admin-pathname after `/{locale}/admin` — "" for the zone
 *  index, "/seo/keywords" for that page. */
function zoneRelativePath(pathname: string | null, locale: string): string | null {
  if (!pathname) return null;

  const base = `/${locale}/admin`;
  if (!pathname.startsWith(base)) return null;

  return pathname.slice(base.length) || "/";
}

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminGrowthLayout({ children, params }: Props) {
  const { locale } = await params;

  const requestHeaders = await headers();
  const relative = zoneRelativePath(requestHeaders.get("x-admin-pathname"), locale);

  const exception = exceptionFor(relative);

  await requireAdmin(locale, exception?.minimum ?? Role.ADMIN);

  return children;
}
