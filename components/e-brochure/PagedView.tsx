"use client";

/**
 * components/e-brochure/PagedView.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The brochure as plain pages, one at a time, with no flip.
 *
 * Two audiences, one component:
 *
 *   - anyone whose system asks for reduced motion. StPageFlip cannot
 *     express "no animation" — Settings.getSettings() throws on a
 *     flippingTime of 0 — so honouring the request means a different
 *     component, not a faster flip. That is the correct reading of the
 *     preference anyway: the ask is to remove the motion, not to hurry it.
 *   - anyone the flipbook failed for, as the fallback the viewer swaps in.
 *
 * It deliberately does not import page-flip, so a visitor who asked for
 * less motion never downloads it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { PdfPages } from "./usePdfPages";

type Props = {
  pages: PdfPages;
  /** 0-based. */
  currentIndex: number;
  /** Alt text for the current page, already localized and interpolated. */
  pageLabel: (index: number) => string;
};

export default function PagedView({ pages, currentIndex, pageLabel }: Props) {
  const src = pages.srcFor(currentIndex);

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-xs bg-primary-900/4 shadow-card"
      style={{
        aspectRatio: pages.aspectRatio,
        /*
          Bounded by the height available, the same way the flipbook is —
          see its note. A page taller than the viewport pushes the toolbar
          off the bottom, which in fullscreen leaves no way to turn it.
        */
        maxWidth: `min(48rem, calc(var(--brochure-max-height) * ${pages.aspectRatio}))`,
      }}
    >
      {src ? (
        /*
          A plain <img>, not next/image: the source is a blob: URL created
          in the browser this second. There is nothing for the optimizer to
          fetch, cache or re-encode, and pointing /_next/image at a blob is
          not a thing that can work.
        */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={pageLabel(currentIndex)}
          className="h-full w-full object-contain"
        />
      ) : (
        // Same shape as the finished page, so the layout does not jump
        // when it arrives.
        <div className="skeleton-shimmer h-full w-full" aria-hidden />
      )}
    </div>
  );
}
