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
 * THE ONE EXCEPTION SLOT
 *
 * Every other admin zone answers "which zone is this?" and stops there —
 * one guard, one minimum, for everything inside it. This zone cannot: the
 * SEO translations screen (lib/locale-completeness.ts, arriving in a later
 * phase) is aimed at content editors — they are the people who know which
 * language is missing what — while everything else here (redirects,
 * structured data, the URL health report) genuinely wants ADMIN. Widening
 * the whole zone to EDITOR to fit one screen would hand every editor the
 * redirect table too, which is the exact shape of mistake this
 * restructuring exists to stop making.
 *
 * ROUTE_EXCEPTIONS is that one screen's escape hatch, and nothing else's.
 * seo/translations (Phase 5) is its first and, so far, only entry — a
 * three-line addition that changed nothing else about this layout's shape.
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

type RouteException = {
  /** Locale-relative, under this zone's own base — "/seo/translations",
   *  never the full "/en/admin/seo/translations". */
  prefix: string;
  /** Must be looser than Role.ADMIN — this slot exists to loosen the
   *  zone's floor for one route, never to tighten it. */
  minimum: Role;
};

const ROUTE_EXCEPTIONS: readonly RouteException[] = [
  { prefix: "/seo/translations", minimum: Role.EDITOR },
];

/** The part of x-admin-pathname after `/{locale}/admin` — "" for the zone
 *  index, "/seo/translations" for that page once it exists. */
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

  // Segment-aware, not a bare startsWith: "/seo/translations-export" is a
  // different route from "/seo/translations" and must not inherit its
  // exception just because the two strings share a prefix.
  const exception = ROUTE_EXCEPTIONS.find(
    (candidate) =>
      relative === candidate.prefix || relative?.startsWith(`${candidate.prefix}/`),
  );

  await requireAdmin(locale, exception?.minimum ?? Role.ADMIN);

  return children;
}
