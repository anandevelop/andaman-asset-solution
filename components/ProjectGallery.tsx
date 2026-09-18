"use client";

/**
 * components/ProjectGallery.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Replaces the old plain 3-column image grid on the project detail page.
 *
 * Earlier versions of this let the grid grow to however many photos a
 * project had (15, 30, whatever), with an occasional 2×2 "featured" tile
 * for rhythm. That's what produced the bug this version fixes: 1×1 tiles
 * plus a 2×2 one only tile perfectly when the total photo count happens
 * to fill whole rows, and it usually doesn't — the last row ends up with
 * one lonely photo and a wide empty gap next to it, which reads as
 * "broken," not "minimal."
 *
 * So the grid itself is fixed now, not open-ended: exactly 6 tiles in a
 * mosaic (tall portrait, wide landscape, small square, a second tall
 * portrait, two more squares — see HERO_LAYOUT below), hand-verified to
 * use every cell in its 3×3 bounding box. A project with 6 photos or 60
 * renders the identical, always-locked layout. Anything beyond the first
 * 6 lives behind a "View all N photos" button that opens the lightbox
 * (with its scrubbable thumbnail strip) instead of trying to keep
 * growing the grid.
 *
 * Below 6 photos there's nothing to build a mosaic out of, so it falls
 * back to a plain uniform grid (no spanning tiles at all) — a partial
 * last row there is just what a normal small grid looks like, not the
 * same failure mode.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Images, Maximize2, X } from "lucide-react";

type Props = {
  images: string[];
  projectName: string;
  labels: {
    close: string;
    previous: string;
    next: string;
    /** "View all {count} photos" — shown once there are more than fit
     *  in the fixed hero cluster. */
    viewAll: string;
  };
};

const HERO_COUNT = 6;

/**
 * A fixed 3×3 mosaic (desktop/tablet only — see the plain 2-col fallback
 * below for mobile), matching a reference layout: tall portrait far
 * left, a wide landscape tile top-right, a small square tucked under it,
 * a second tall portrait on the far right, and two squares along the
 * bottom. Traced cell-by-cell so it's provably exact rather than
 * eyeballed: (2 rows × col1) + (1 row × col2-3) + (1 × col2) +
 * (2 rows × col3) + (1 × col1) + (1 × col2) = 2+2+1+2+1+1 = 9 cells,
 * which is exactly a 3×3 grid — no leftover cell, regardless of image
 * count, because this is always exactly 6 tiles.
 */
const HERO_LAYOUT = [
  "sm:col-start-1 sm:row-start-1 sm:row-span-2", // tall, far left
  "sm:col-start-2 sm:col-span-2 sm:row-start-1", // wide, top right
  "sm:col-start-2 sm:row-start-2", // small square
  "sm:col-start-3 sm:row-start-2 sm:row-span-2", // tall, far right
  "sm:col-start-1 sm:row-start-3", // bottom left square
  "sm:col-start-2 sm:row-start-3", // bottom middle square
];

const HERO_SIZES = [
  "(max-width: 640px) 50vw, 33vw",
  "(max-width: 640px) 50vw, 66vw",
  "(max-width: 640px) 50vw, 33vw",
  "(max-width: 640px) 50vw, 33vw",
  "(max-width: 640px) 50vw, 33vw",
  "(max-width: 640px) 50vw, 33vw",
];

const tileVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

/** Shared entrance-animation props so the hero cluster and the small-grid
 *  fallback stagger in the same way. */
function tileMotionProps(i: number) {
  return {
    initial: "hidden",
    whileInView: "visible",
    viewport: { once: true, margin: "-60px" },
    variants: tileVariants,
    // Wave of staggered delays rather than one growing linearly with the
    // index — otherwise tile 10 would wait noticeably longer than tile 0.
    transition: { duration: 0.5, delay: (i % 6) * 0.07, ease: "easeOut" },
  } as const;
}

export default function ProjectGallery({ images, projectName, labels }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const showPrev = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length)),
    [images.length],
  );
  const showNext = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i + 1) % images.length)),
    [images.length],
  );

  // Keyboard nav while the lightbox is open — Escape/←/→. Only attached
  // while `openIndex` is set, so the rest of the page keeps its own
  // arrow-key/Escape behaviour (nothing else on this page listens for
  // them today, but this scopes it defensively regardless).
  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex, close, showPrev, showNext]);

  const hasHeroCluster = images.length >= HERO_COUNT;
  const remainingCount = images.length - HERO_COUNT;

  return (
    <>
      {hasHeroCluster ? (
        // Mobile falls back to a plain 2-column grid of the same 6
        // images (no spans) — 6 ÷ 2 is exact, so it tiles perfectly
        // without needing a mobile-specific mosaic. sm: and up switches
        // to the 3×3 HERO_LAYOUT mosaic via each tile's own classes.
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:auto-rows-[150px] sm:gap-3">
          {images.slice(0, HERO_COUNT).map((src, i) => (
            <motion.button
              key={src}
              type="button"
              onClick={() => setOpenIndex(i)}
              {...tileMotionProps(i)}
              className={`group relative block aspect-square overflow-hidden rounded-xs shadow-card sm:aspect-auto ${HERO_LAYOUT[i]}`}
            >
              <Image
                src={src}
                alt={`${projectName} view ${i + 1}`}
                fill
                sizes={HERO_SIZES[i]}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                priority={i === 0}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-primary-900/0 opacity-0 transition-all duration-300 group-hover:bg-primary-900/30 group-hover:opacity-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-cardHover sm:h-9 sm:w-9">
                  <Maximize2 size={14} aria-hidden />
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        // Too few photos to feature one — a plain uniform grid instead.
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {images.map((src, i) => (
            <motion.button
              key={src}
              type="button"
              onClick={() => setOpenIndex(i)}
              {...tileMotionProps(i)}
              className="group relative block aspect-square overflow-hidden rounded-xs shadow-card"
            >
              <Image
                src={src}
                alt={`${projectName} view ${i + 1}`}
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-primary-900/0 opacity-0 transition-all duration-300 group-hover:bg-primary-900/30 group-hover:opacity-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-cardHover sm:h-9 sm:w-9">
                  <Maximize2 size={14} aria-hidden />
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {hasHeroCluster && remainingCount > 0 && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setOpenIndex(0)} className="btn-outline">
            <Images size={15} aria-hidden />
            {labels.viewAll}
          </button>
        </div>
      )}

      <AnimatePresence>
        {openIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/95 p-4 sm:p-10"
            onClick={close}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={close}
              aria-label={labels.close}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6 sm:top-6"
            >
              <X size={20} aria-hidden />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                showPrev();
              }}
              aria-label={labels.previous}
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
            >
              <ChevronLeft size={20} aria-hidden />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                showNext();
              }}
              aria-label={labels.next}
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
            >
              <ChevronRight size={20} aria-hidden />
            </button>

            <motion.div
              key={openIndex}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="relative h-[62vh] w-full max-w-5xl sm:h-[72vh]"
              onClick={(event) => event.stopPropagation()}
            >
              <Image
                src={images[openIndex]}
                alt={`${projectName} view ${openIndex + 1}`}
                fill
                sizes="90vw"
                className="object-contain"
                priority
              />
            </motion.div>

            {/* Counter + scrubbable thumbnail strip — most useful exactly
                when there are enough photos that jumping around by arrow
                key alone would be slow. */}
            <div
              className="absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-3 sm:bottom-6"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-xs font-medium uppercase tracking-widest2 text-white/70">
                {openIndex + 1} / {images.length}
              </p>
              <div
                className="flex max-w-[92vw] gap-2 overflow-x-auto px-4
                  [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
              >
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setOpenIndex(i)}
                    aria-label={`${projectName} view ${i + 1}`}
                    aria-current={i === openIndex}
                    className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xs transition-opacity sm:h-14 sm:w-14 ${
                      i === openIndex ? "opacity-100 ring-2 ring-white" : "opacity-45 hover:opacity-75"
                    }`}
                  >
                    <Image src={src} alt="" fill sizes="56px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
