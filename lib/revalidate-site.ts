/**
 * lib/revalidate-site.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Purge every public page, in every language, after an edit to something
 * the site layout renders on all of them (the closing CTA band, the sales
 * strip) or that several pages show at once (the About page's sections,
 * which the home page repeats).
 *
 * WHY THIS EXISTS — THE BUG IT REPLACES
 *
 * Those actions used to call, once per locale:
 *
 *     revalidatePath("/th", "layout")   // and "/en", "/zh", "/ru"
 *
 * which purges nothing. With type "layout", Next matches the *route*
 * layout — the cache tag is built from the folder pattern,
 * `/[locale]/layout` — not a URL, so the literal "/th" names a layout that
 * does not exist. `next dev` renders every request fresh, so the edits
 * looked fine locally; in production each public page kept serving its
 * cached copy until its own `revalidate` window ran out (up to an hour).
 * Changing which CTA a page shows was the visible case: saved, stored,
 * and not on the site.
 *
 * WHY SO WIDE
 *
 * Most public data is read in more places than the page it belongs to.
 * The site layout lists the published projects (footer, the closing CTA's
 * count) on every page; the home page's company figures count units,
 * milestones and awards; project cards carry unit-type bedrooms and the
 * latest progress update. Purging "the page this edit is about" kept
 * missing one of those, so content actions purge the lot. Pages re-render
 * on their next request, which for a site this size is cheap.
 *
 * "/" + "layout" is the root layout, which every page sits under, so this
 * is the one call that reliably reaches all of them. It is what the site
 * copy save (lib/site-copy-save.ts) and the settings save already did.
 * The admin pages under it are dynamic and lose nothing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { revalidatePath } from "next/cache";

export function revalidatePublicSite() {
  revalidatePath("/", "layout");
}
