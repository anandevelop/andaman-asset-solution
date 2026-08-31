"use client";

import { useCallback, useEffect, useState } from "react";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type FloorPlan = {
  id: string;
  floorName: string;
  imageUrl: string;
};

type Labels = {
  close: string;
  previous: string;
  next: string;
};

type Props = {
  floorPlans: FloorPlan[];
  typeName: string;
  labels: Labels;
};

/**
 * Shows one floor-plan image at a time, large, with a row of floor-select
 * buttons above it (e.g. "Ground Floor" / "1st Floor" / "2nd Floor").
 * Replaces the previous small-thumbnail grid — a single big image is far
 * easier to read, and the tabs let a villa type with any number of floors
 * (varies per project) switch between them without scrolling.
 *
 * The image container's aspect-ratio is set to match each image's own
 * natural dimensions (captured on load) rather than a fixed box, so the
 * artwork fills the container edge-to-edge with no letterboxing — floor
 * plans get uploaded at all sorts of aspect ratios (wide site plans,
 * near-square unit plans, etc.) and a fixed box would leave empty bars
 * around anything that doesn't match it.
 *
 * Tapping the image opens a full-screen lightbox (arrows step through the
 * same floor list, Escape/←/→ work too) — mirrors ProgressGallery's
 * lightbox pattern so viewing a floor plan up close works the same way
 * as every other tappable image on the site.
 */
export default function FloorPlanViewer({ floorPlans, typeName, labels }: Props) {
  const [activeId, setActiveId] = useState(floorPlans[0]?.id);
  const [ratio, setRatio] = useState(4 / 3);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const activeIndex = Math.max(
    0,
    floorPlans.findIndex((fp) => fp.id === activeId),
  );
  const active = floorPlans[activeIndex] ?? floorPlans[0];

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const showPrev = useCallback(() => {
    setActiveId(floorPlans[(activeIndex - 1 + floorPlans.length) % floorPlans.length].id);
  }, [activeIndex, floorPlans]);
  const showNext = useCallback(() => {
    setActiveId(floorPlans[(activeIndex + 1) % floorPlans.length].id);
  }, [activeIndex, floorPlans]);

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, closeLightbox, showPrev, showNext]);

  if (!active) return null;

  return (
    <div>
      {floorPlans.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {floorPlans.map((fp) => (
            <button
              key={fp.id}
              type="button"
              onClick={() => setActiveId(fp.id)}
              className={`border px-3 py-1.5 text-xs font-medium transition-colors ${
                fp.id === active.id
                  ? "border-accent-700 bg-accent-700 text-white"
                  : "border-primary/15 text-ink/60 hover:border-accent-700/40 hover:text-primary"
              }`}
            >
              {fp.floorName}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="group relative block w-full overflow-hidden rounded-sm border border-primary/10 bg-white"
        style={{ aspectRatio: ratio }}
        aria-label={`${typeName} — ${active.floorName}`}
      >
        <ImageWithSkeleton
          key={active.id}
          src={active.imageUrl}
          alt={`${typeName} — ${active.floorName}`}
          fill
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-contain transition-transform duration-500 group-hover:scale-[1.02]"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setRatio(img.naturalWidth / img.naturalHeight);
            }
          }}
        />
        <span className="absolute inset-x-0 bottom-0 bg-primary-900/70 px-3 py-1.5 text-center text-xs text-white">
          {active.floorName}
        </span>
      </button>

      <AnimatePresence>
        {lightboxOpen && (
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

            {floorPlans.length > 1 && (
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
              key={active.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="relative h-[62vh] w-full max-w-5xl sm:h-[72vh]"
              onClick={(event) => event.stopPropagation()}
            >
              <ImageWithSkeleton
                src={active.imageUrl}
                alt={`${typeName} — ${active.floorName}`}
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
              {active.floorName}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
