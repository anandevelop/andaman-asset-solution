/**
 * app/[locale]/loading.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Streaming fallback for every route under /[locale].
 *
 * A skeleton rather than a spinner. The pages this covers all share the
 * same shape — eyebrow, heading, divider, then a card grid — so mirroring
 * that shape means the layout does not jump when content arrives, and the
 * wait reads as loading rather than as breakage.
 *
 * No text at all, which is what makes it locale-agnostic.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Shimmer defined once; `animate-shimmer` comes from tailwind.config.ts. */
const shimmer =
  "bg-gradient-to-r from-primary/[0.04] via-primary/[0.09] to-primary/[0.04] bg-[length:200%_100%] animate-shimmer";

export default function LocaleLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Screen readers get words; sighted users get the skeleton. */}
      <span className="sr-only">Loading…</span>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <div className={`h-3 w-24 rounded-sm ${shimmer}`} />
        <div className={`mt-5 h-10 w-full max-w-md rounded-sm ${shimmer}`} />
        <div className={`mt-6 h-3 w-full max-w-sm rounded-sm ${shimmer}`} />
        <div className={`mt-2 h-3 w-full max-w-xs rounded-sm ${shimmer}`} />
      </section>

      {/* ── Card grid ──────────────────────────────────────────────── */}
      <section className="container-luxe py-14 sm:py-20">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-sm border border-primary/10 bg-white"
            >
              <div className={`aspect-[4/3] w-full ${shimmer}`} />

              <div className="p-6">
                <div className={`h-2.5 w-28 rounded-sm ${shimmer}`} />
                <div className={`mt-3 h-5 w-3/4 rounded-sm ${shimmer}`} />
                <div className={`mt-3 h-3 w-full rounded-sm ${shimmer}`} />
                <div className={`mt-2 h-3 w-5/6 rounded-sm ${shimmer}`} />

                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-primary/10 pt-5">
                  <div className={`h-3 w-20 rounded-sm ${shimmer}`} />
                  <div className={`h-3 w-16 rounded-sm ${shimmer}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
