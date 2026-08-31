"use client";

/**
 * components/CompanyIntroGallery.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The expanding-strip photo accordion beside the "Who we are" copy — see
 * components/CompanyIntro.tsx, which owns the section and the slide data.
 *
 * One panel is expanded at a time; the rest collapse to narrow vertical
 * strips carrying a rotated project label. The active panel advances on
 * its own and wraps around forever, and any pointer or keyboard focus
 * inside the strip stops it, so it never moves under someone who is
 * actually looking at it.
 *
 * A Client Component for exactly that reason (hover, focus, a timer).
 * Everything it renders arrives already-localized from the server
 * component above it — the same split as HeroCarousel/lib/hero-story.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";

export type IntroGallerySlide = {
  src: string;
  /**
   * A whole Tailwind object-position class, not a raw value: a collapsed
   * panel is an ~80px slice of a landscape photo and the middle of the
   * frame is not always the part worth showing, so each photo names its
   * own crop. Written out in full so Tailwind's scanner can see them.
   */
  objectPosition: string;
  label: string;
  alt: string;
};

/** Long enough to look at a photo, short enough to notice it moves. */
const ADVANCE_MS = 4500;

/** Shared so the expand and the fades land together. */
const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

export default function CompanyIntroGallery({ slides }: { slides: IntroGallerySlide[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    // Never runs for a visitor who asked for less motion — they still get
    // the accordion, they just drive it themselves.
    if (paused || reducedMotion || slides.length < 2) return;

    const id = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      ADVANCE_MS,
    );

    return () => window.clearInterval(id);
  }, [paused, reducedMotion, slides.length]);

  return (
    <div
      className="flex h-[32rem] w-full flex-col gap-1.5 sm:aspect-[4/3] sm:h-auto sm:flex-row sm:gap-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {slides.map((slide, index) => {
        const isActive = index === active;

        return (
          <button
            key={slide.src}
            type="button"
            aria-pressed={isActive}
            aria-label={slide.label}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive(index)}
            // Sizing is .intro-strip-panel in app/globals.css, driven off
            // this attribute — it has to change at the `sm` breakpoint and
            // a style prop cannot.
            data-expanded={isActive}
            className="intro-strip-panel relative min-h-0 min-w-0 overflow-hidden rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ImageWithSkeleton
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 30vw"
              className={`${slide.objectPosition} object-cover`}
            />

            {/* Sets the collapsed strips back from the expanded one. Kept
                deliberately light — a heavier version read as "the photos
                are dark" rather than as depth. */}
            <span
              aria-hidden
              className={`absolute inset-0 bg-primary-900 transition-opacity duration-700 ${EASE} ${
                isActive ? "opacity-0" : "opacity-[0.12]"
              }`}
            />

            {/* Carries the label, whichever way it is set. */}
            <span aria-hidden className="intro-strip-scrim absolute inset-0" />

            {/* Extra base under the collapsed label only — see the class
                comment in app/globals.css. Whole bar when stacked, bottom
                three fifths of the strip when side by side. */}
            <span
              aria-hidden
              className={`intro-strip-band absolute inset-x-0 bottom-0 h-full transition-opacity duration-500 ${EASE} sm:h-3/5 ${
                isActive ? "opacity-0" : "opacity-100"
              }`}
            />

            {/* Collapsed: flat at the left of the bar when stacked, running
                up the strip once they are side by side. */}
            <span
              aria-hidden
              className={`absolute inset-0 flex items-center px-4 transition-opacity duration-300 sm:items-end sm:justify-center sm:px-0 sm:pb-4 ${
                isActive ? "opacity-0" : "opacity-100"
              }`}
            >
              <span className="intro-strip-label">{slide.label}</span>
            </span>

            {/* Expanded: the same label, always set flat. Allowed to wrap —
                a narrow strip at the `sm` breakpoint does not fit "The
                Residence Prime" on one line. */}
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 block p-4 text-left text-sm font-light uppercase leading-snug tracking-[0.06em] text-white transition-opacity duration-500 sm:p-5 sm:text-base lg:text-lg ${
                isActive ? "opacity-100" : "opacity-0"
              }`}
            >
              {slide.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
