/**
 * lib/indexing.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Whether this deployment may be indexed by search engines.
 *
 * WHY THIS IS AN EXPLICIT ENV AND NOT A GUESS
 *
 * app/robots.ts used to work it out: `VERCEL_ENV === "production"`, or
 * `NODE_ENV === "production"` with no VERCEL_ENV. That describes the
 * canonical site — and it describes the staging container just as well,
 * because staging is the same Docker image with NODE_ENV=production and no
 * Vercel anywhere. So staging has been serving `Allow: /` and inviting
 * Google to index a second copy of every page, competing with the real
 * site for its own queries.
 *
 * It cannot be settled by looking at the request host either, at least not
 * here: Next's robots.ts and generateMetadata get no request, and comparing
 * against NEXT_PUBLIC_SITE_URL would agree with itself on staging, where
 * that variable is set to the staging URL.
 *
 * So it is stated rather than inferred, and the direction of the default is
 * the entire point: a deployment that says nothing is *not* indexable. Get
 * it wrong on staging and nothing happens; get it wrong on the real site
 * and the pages are absent from Google until someone notices, which is
 * recoverable. The other way round costs removal requests and a wait for
 * recrawls.
 *
 * The real site therefore has to set SITE_INDEXABLE=true. lib/env.ts lists
 * it as RECOMMENDED so a server that has not set it says so at boot.
 *
 * Not a NEXT_PUBLIC_ variable on purpose: those are compiled in at build
 * time (see lib/env.ts), so one image could never be both the staging
 * deployment and the production one. This is read at runtime, from the
 * container's own environment.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * True only when the deployment has explicitly declared itself indexable.
 *
 * Read on each call rather than captured in a module constant, so a test
 * can set the variable and see the change — and so the value cannot be
 * frozen at import time in a long-lived server.
 */
export function isSiteIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}

/**
 * A page's robots metadata, gated by whether this deployment may be indexed
 * at all.
 *
 * The root layout sets a site-wide default, but Next lets a page's own
 * metadata replace it outright — so every page that says `index: true` for
 * its own reasons was still saying it on staging. This is that decision and
 * the deployment-wide one in the same place: a page can only ask to be
 * indexed on a deployment that is indexable.
 *
 * `follow` defaults to true because a page excluded for its own reasons —
 * a filtered listing, an article an editor marked noIndex — still wants its
 * links crawled. A deployment that is not indexable at all wants neither,
 * matching the X-Robots-Tag it already sends.
 */
export function robotsMetadata(page: { index: boolean; follow?: boolean }): {
  index: boolean;
  follow: boolean;
} {
  if (!isSiteIndexable()) return { index: false, follow: false };
  return { index: page.index, follow: page.follow ?? true };
}
