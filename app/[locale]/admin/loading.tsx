/**
 * app/[locale]/admin/loading.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Streaming fallback for the admin.
 *
 * A skeleton rather than a spinner. The pages this covers all share the
 * same shape — eyebrow, heading, divider, then a card grid — so mirroring
 * that shape means the layout does not jump when content arrives, and the
 * wait reads as loading rather than as breakage.
 *
 * No text at all, which is what makes it locale-agnostic.
 *
 * ── Why this is scoped to /admin, not to /[locale] ─────────────────────
 *
 * It used to sit at app/[locale]/loading.tsx and cover the public site too,
 * which quietly turned every not-found page on the site into a soft 404.
 *
 * A loading.tsx is a Suspense boundary, and Next streams the shell as soon
 * as one exists — committing `200 OK` to the wire before the page body has
 * run. So the notFound() in projects/[slug], news/[slug], events/[slug] and
 * e-brochure/[slug] rendered the right page under the wrong status. Google
 * reads 200 as "this URL is real content": it indexes the not-found page and
 * reports the rest as soft 404s. Removing the boundary is the entire fix —
 * with no shell flushed early, notFound() sets a real 404.
 *
 * Nothing is lost on the public site. Every page there is ISR-cached (they
 * all export `revalidate`), so visitors are served prerendered HTML and did
 * not see this skeleton in steady state; and the one genuinely interactive
 * path, filtering the project list, has its own pending state via
 * useTransition in ProjectFilterBar.
 *
 * The admin is the opposite case — authenticated, `no-store`, re-queried on
 * every request, and noindex — so the skeleton is actually seen here, and a
 * soft 404 on a deleted record costs nothing because no crawler reaches it.
 *
 * tests/routes.test.ts pins this placement.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Shimmer defined once; `animate-shimmer` comes from tailwind.config.ts. */
const shimmer =
  "bg-linear-to-r from-primary/4 via-primary/9 to-primary/4 bg-size-[200%_100%] animate-shimmer";

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Screen readers get words; sighted users get the skeleton. */}
      <span className="sr-only">Loading…</span>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <div className={`h-3 w-24 rounded-xs ${shimmer}`} />
        <div className={`mt-5 h-10 w-full max-w-md rounded-xs ${shimmer}`} />
        <div className={`mt-6 h-3 w-full max-w-sm rounded-xs ${shimmer}`} />
        <div className={`mt-2 h-3 w-full max-w-xs rounded-xs ${shimmer}`} />
      </section>

      {/* ── Card grid ──────────────────────────────────────────────── */}
      <section className="container-luxe py-14 sm:py-20">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-xs border border-primary/10 bg-white"
            >
              <div className={`aspect-4/3 w-full ${shimmer}`} />

              <div className="p-6">
                <div className={`h-2.5 w-28 rounded-xs ${shimmer}`} />
                <div className={`mt-3 h-5 w-3/4 rounded-xs ${shimmer}`} />
                <div className={`mt-3 h-3 w-full rounded-xs ${shimmer}`} />
                <div className={`mt-2 h-3 w-5/6 rounded-xs ${shimmer}`} />

                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-primary/10 pt-5">
                  <div className={`h-3 w-20 rounded-xs ${shimmer}`} />
                  <div className={`h-3 w-16 rounded-xs ${shimmer}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
