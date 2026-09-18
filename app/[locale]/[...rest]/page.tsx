/**
 * app/[locale]/[...rest]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The last route Next tries. Anything under a locale that matched no real
 * page arrives here — /th/promo, /th/villa, /en/porjects — and gets one
 * chance to be a redirect before it becomes a 404.
 *
 * WHY THIS EXISTS WHEN app/api/not-found ALREADY LOOKS REDIRECTS UP
 *
 * That lookup runs from the browser, after the 404 boundary has rendered,
 * and finishes with router.replace(). For a person that is a flash of the
 * wrong page and then the right one. For Google it is nothing at all: a
 * crawler sees 404 and leaves, so a vanity URL printed on a brochure or a
 * billboard passes no signal to the page it points at, which is most of
 * what a redirect is for.
 *
 * Handled here, the same request answers 308 or 307 with a Location
 * header, before any HTML exists. The client-side lookup stays where it is
 * — it still covers a notFound() thrown from inside a page that *did*
 * match, which never reaches this file.
 *
 * A route with no matching page never rendered anything before this file
 * existed, so nothing that used to work goes through here; the only paths
 * it sees are the ones that were already going to 404.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { notFound } from "next/navigation";
import { redirectIfMoved } from "@/lib/redirects";
import { locales } from "@/i18n";

// Every request is a lookup against a table an admin edits, so there is
// nothing here worth caching — and caching it would mean a redirect
// created in the admin did not take effect.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; rest: string[] }> };

export default async function CatchAllPage(props: Props) {
  const { locale, rest } = await props.params;

  // A locale this app does not serve cannot be stripped off the front of
  // the path to make a lookup key, so it is only ever a 404.
  if (!(locales as readonly string[]).includes(locale)) notFound();

  /*
    Rebuilt from the segments rather than read off the request, so the key
    is always the locale-relative path Redirect rows are stored as, with no
    query string and no locale prefix. Segments arrive URL-decoded; they
    are re-encoded so a path with a space or a Thai character matches the
    row that was saved for it.
  */
  const path = `/${rest.map(encodeURIComponent).join("/")}`;

  await redirectIfMoved(locale, path);

  notFound();
}
