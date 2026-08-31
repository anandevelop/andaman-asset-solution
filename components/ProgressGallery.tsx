"use client";

/**
 * components/ProgressGallery.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Construction Progress section on the project page — a month picker
 * (tabs) above a single horizontal row of that month's photos.
 *
 * The photo row used to be a plain 1/3-column grid, wrapping onto extra
 * rows once a month had more than 3 photos — with a lot of aerial drone
 * shots per month that got tall fast. It's now a single-row, snap-scroll
 * strip instead (same pattern as FacilityScroller's >4-facilities row —
 * ‹ › buttons that step exactly one card, edge-aware disabled states, a
 * hidden native scrollbar since drag/swipe/wheel all already work without
 * it), so a month's whole photo set lives in one horizontal reel no
 * matter how many photos it has.
 *
 * A month's YouTube link (drone footage) is the deliberately larger,
 * feature element above that reel — full width, a labelled badge so the
 * jump in scale from the photo cards reads as "this is the highlight",
 * not a layout mismatch — rather than being sized to match a photo tile.
 *
 * The ‹ › buttons show on every breakpoint, not just sm+ like
 * FacilityScroller's — a facility row's cards are recognisably "a row of
 * cards" on their own, but a single full-bleed photo on mobile doesn't
 * read as "there's more" without an explicit arrow hinting at it, so the
 * hint stays even though touch users can already swipe.
 *
 * Tapping any photo opens a full-screen lightbox (arrows + Escape/←/→,
 * same pattern as ProjectGallery's) so all of a month's photos are
 * reachable that way too, not just by scrolling the row itself.
 *
 * The track itself gets fully remounted on every month switch (it's a
 * child of the `key={month.id}` motion.div below, so AnimatePresence's
 * "wait" mode tears the whole subtree down and rebuilds it) — that's what
 * resets scroll position back to the start for free on each switch,
 * rather than needing to track and reset scrollLeft by hand. The button
 * effect below still has to be told about it via `month.id` in its
 * dependency array, though: the ref reattaching to a new DOM node doesn't
 * by itself make the effect re-run and re-measure that node. Lightbox
 * state is local to PhotoRow for the same reason — remounting on month
 * switch closes it for free too.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Youtube, X } from "lucide-react";
import type { ProgressMonth } from "@/lib/projects";
import { formatMonthYear } from "@/lib/format";

type Labels = {
  close: string;
  previous: string;
  next: string;
  /** Small badge overlaid on the featured video, e.g. "Drone footage". */
  video: string;
};

type Props = {
  /** Published ProjectProgress rows, chronological. Fetched server-side by
   *  the project page via getProjectProgress(). */
  months: ProgressMonth[];
  locale: string;
  emptyLabel: string;
  labels: Labels;
};

// Slack on the edge checks — scrollWidth/clientWidth can disagree with
// scrollLeft by a fraction of a pixel after a smooth-scroll settles,
// which would otherwise leave the "next" button stuck disabled (or
// enabled with nowhere left to go) right at the end of the track.
const EDGE_EPSILON_PX = 2;

function PhotoRow({
  images,
  label,
  labels,
}: {
  images: string[];
  label: string;
  labels: Labels;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const firstCardRef = useRef<HTMLLIElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > EDGE_EPSILON_PX);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_EPSILON_PX);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });

    // Re-checks on resize (a photo count that fits without scrolling at
    // one viewport width might not at another).
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
    // images.length: see the file header comment — this track gets a
    // fresh DOM node on every month switch, and the effect needs to
    // re-run against that new node rather than the torn-down one.
  }, [updateEdges, images.length]);

  const scrollByOneCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = firstCardRef.current;
    if (!track || !card) return;

    const gapPx = parseFloat(getComputedStyle(track).columnGap || "0");
    const distance = card.getBoundingClientRect().width + gapPx;

    track.scrollBy({ left: distance * direction, behavior: "smooth" });
  };

  const closeLightbox = useCallback(() => setOpenIndex(null), []);
  const showPrev = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length)),
    [images.length],
  );
  const showNext = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i + 1) % images.length)),
    [images.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex, closeLightbox, showPrev, showNext]);

  const buttonClass =
    "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full border border-primary/10 bg-white text-primary shadow-card transition-opacity " +
    "hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-0 sm:h-10 sm:w-10";

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1
          [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <motion.li
            key={src}
            ref={i === 0 ? firstCardRef : undefined}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            // Whole cards only, no partial peek of the next one — 1 across
            // on mobile, 2 on tablet, exactly 4 on desktop. Widths solved
            // from the track's own gap-4 (16px), same approach as
            // FacilityScroller's 4-across math, so there's no fractional
            // sliver of a 5th photo poking in at the edge on desktop.
            className="relative aspect-[4/3] w-full shrink-0 snap-start overflow-hidden
              rounded-sm bg-primary/5 shadow-card sm:w-[calc((100%_-_16px)/2)]
              lg:w-[calc((100%_-_3*16px)/4)]"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              className="group relative block h-full w-full"
              aria-label={`${label} construction progress photo ${i + 1}`}
            >
              <Image
                src={src}
                alt={`${label} construction progress photo ${i + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                priority={i === 0}
              />
            </button>
          </motion.li>
        ))}
      </ul>

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label={labels.previous}
            onClick={() => scrollByOneCard(-1)}
            disabled={!canScrollLeft}
            className={`${buttonClass} -left-3 sm:-left-5`}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={labels.next}
            onClick={() => scrollByOneCard(1)}
            disabled={!canScrollRight}
            className={`${buttonClass} -right-3 sm:-right-5`}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </>
      )}

      {/* Lightbox — every photo in this month, reachable regardless of
          where the row itself happens to be scrolled to. */}
      <AnimatePresence>
        {openIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/95 p-4 sm:p-10"
            onClick={closeLightbox}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={closeLightbox}
              aria-label={labels.close}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6 sm:top-6"
            >
              <X size={20} aria-hidden />
            </button>

            {images.length > 1 && (
              <>
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
              </>
            )}

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
                alt={`${label} construction progress photo ${openIndex + 1}`}
                fill
                sizes="90vw"
                className="object-contain"
                priority
              />
            </motion.div>

            <p
              className="absolute inset-x-0 bottom-4 z-10 text-center text-xs font-medium uppercase tracking-widest2 text-white/70 sm:bottom-6"
              onClick={(event) => event.stopPropagation()}
            >
              {openIndex + 1} / {images.length}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProgressGallery({ months, locale, emptyLabel, labels }: Props) {
  // Open on the most recent month.
  const [active, setActive] = useState(Math.max(0, months.length - 1));

  if (months.length === 0) {
    return (
      <p className="border border-dashed border-primary/15 bg-white/50 p-12 text-center text-sm text-ink/65">
        {emptyLabel}
      </p>
    );
  }

  const month = months[Math.min(active, months.length - 1)];
  const label = formatMonthYear(locale, month.year, month.month);

  return (
    <div>
      {/* Month tabs */}
      <div className="flex flex-wrap gap-2 border-b border-primary/10 pb-4">
        {months.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={active === i}
            className={`rounded-full px-4 py-2 text-xs font-medium uppercase tracking-wide transition-colors ${
              active === i
                ? "bg-primary text-white"
                : "bg-white text-ink/70 hover:bg-primary/5"
            }`}
          >
            {formatMonthYear(locale, m.year, m.month)}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={month.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="pt-8"
        >
          {month.videoEmbedUrl && (
            <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-lg bg-primary-900 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)]">
              <iframe
                src={month.videoEmbedUrl}
                title={`${label} drone footage`}
                className="h-full w-full"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
              <span
                className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5
                  rounded-full bg-primary-900/70 px-3 py-1.5 text-[11px] font-medium uppercase
                  tracking-wide text-white backdrop-blur-sm sm:left-6 sm:top-6"
              >
                <Youtube size={13} aria-hidden />
                {labels.video}
              </span>
            </div>
          )}

          <PhotoRow images={month.images} label={label} labels={labels} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
