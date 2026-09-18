"use client";

/**
 * components/RouteGate.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Renders its children on some routes and not others.
 *
 * Exists because a Next layout cannot see which page it is wrapping: the
 * one place a site-wide section can be mounted is the one place with no
 * way to ask "which page is this?". `usePathname()` can, so this is the
 * smallest client boundary that answers it.
 *
 * `children` is a server component, rendered on the server and handed over
 * as already-finished markup — this only decides whether it reaches the
 * DOM. Its data fetching still happens on the routes where it is hidden,
 * which is cheap here (the queries behind the closing CTA are cache()d and
 * shared with the footer) and is the trade for not restructuring thirteen
 * pages so each can mount its own copy.
 *
 * Paths are locale-relative and matched as prefixes, so "/projects" covers
 * /th/projects and every project page under it. "/" is the home page and
 * matches only itself — as a prefix it would match the whole site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { routeMatches } from "@/lib/public-paths";

export default function RouteGate({
  only,
  except,
  children,
}: {
  /** Render on these routes and nowhere else. */
  only?: readonly string[];
  /** Render everywhere but these. Applied after `only`. */
  except?: readonly string[];
  children: ReactNode;
}) {
  const pathname = usePathname();

  // routeMatches lives in lib/public-paths.ts so the CTA's own tests can
  // check this same rule rather than a second copy of it.
  const matches = (path: string) => routeMatches(pathname, path);

  if (only && !only.some(matches)) return null;
  if (except?.some(matches)) return null;

  return <>{children}</>;
}
