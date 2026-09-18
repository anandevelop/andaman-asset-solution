/**
 * components/CompanyIntroGallery.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The photo mosaic beside the "Who we are" copy — see
 * components/CompanyIntro.tsx, which owns the section and the slide data.
 *
 * One large photo plus up to four more beside it, arranged differently at
 * each breakpoint on purpose rather than the same grid just reflowed:
 *
 *   - Mobile only ever shows the main photo plus its first two secondaries,
 *     side by side below it. That ceiling is deliberate, not a cut corner —
 *     a phone-width 2x2 grid of thumbnails is too small to read a label on,
 *     so a fifth+ photo simply isn't shown there.
 *   - From `sm:` up there is room for the rest: up to four secondaries in a
 *     2-per-row grid beside the main photo (an odd one out spans the full
 *     row rather than leaving a gap — the same resolution VisionMission.tsx
 *     uses for its own 2-column stat grid).
 *
 * Replaces the previous auto-advancing accordion — that mechanic existed to
 * show an arbitrary number of photos one at a time; a static grid showing
 * several at once needs no client-side JS at all, hence no "use client"
 * here. A sixth+ photo, if one is ever added in the admin, still isn't
 * shown anywhere — trim the list to five for this section to stay
 * intentional.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";

export type IntroGallerySlide = {
  src: string;
  /**
   * A whole Tailwind object-position class, not a raw value: Tailwind's
   * scanner only generates CSS for strings it sees in source, and this
   * value comes from the database — see HomeGalleryPhoto's schema.prisma
   * comment.
   */
  objectPosition: string;
  label: string;
  alt: string;
};

function GalleryPhoto({
  slide,
  sizes,
  className = "",
}: {
  slide: IntroGallerySlide;
  sizes: string;
  className?: string;
}) {
  return (
    <div className={`relative min-h-0 min-w-0 overflow-hidden rounded-xs ${className}`}>
      <ImageWithSkeleton
        src={slide.src}
        alt={slide.alt}
        fill
        sizes={sizes}
        className={`${slide.objectPosition} object-cover`}
      />

      {/* Bottom-fade scrim so the label reads over any photo — see the
          utility's own comment in globals.css for the contrast-tuning
          behind its exact stops. */}
      <span aria-hidden className="company-intro-scrim absolute inset-0" />

      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 block p-4 text-left text-sm font-light uppercase leading-snug tracking-[0.06em] text-white sm:p-5 sm:text-base lg:text-lg"
      >
        {slide.label}
      </span>
    </div>
  );
}

export default function CompanyIntroGallery({ slides }: { slides: IntroGallerySlide[] }) {
  // Renders nothing when there is nothing to show — matching
  // AwardsSection/FaqAccordion's convention — rather than an empty,
  // fixed-height box. CompanyIntro.tsx's own grid collapses to one column
  // in that case.
  if (slides.length === 0) return null;

  const [main, ...secondaries] = slides;

  // One photo: the whole area, no split — there is nothing to pair it with.
  if (secondaries.length === 0) {
    return (
      <div className="h-128 w-full sm:aspect-4/3 sm:h-auto">
        <GalleryPhoto slide={main} sizes="(max-width: 1024px) 100vw, 48vw" />
      </div>
    );
  }

  // Two photos total: the same 2:1 split as below, just with one photo
  // filling the whole right-hand side instead of a stacked or gridded set.
  if (secondaries.length === 1) {
    return (
      <div className="grid h-128 grid-cols-2 gap-2 sm:aspect-4/3 sm:h-auto sm:grid-cols-[2fr_1fr]">
        <GalleryPhoto slide={main} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 60vw, 32vw" />
        <GalleryPhoto slide={secondaries[0]} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 30vw, 16vw" />
      </div>
    );
  }

  // Three photos total (exactly two secondaries): stacked, not gridded —
  // two thumbnails side by side would be squarer and smaller than they are
  // worth at this count. Four+ secondaries below switch to an actual grid.
  if (secondaries.length === 2) {
    return (
      <div className="grid h-128 grid-cols-2 grid-rows-[2fr_1fr] gap-2 sm:aspect-4/3 sm:h-auto sm:grid-cols-[2fr_1fr] sm:grid-rows-1">
        <GalleryPhoto
          slide={main}
          className="col-span-2 sm:col-span-1"
          sizes="(max-width: 1024px) 100vw, 32vw"
        />

        {/* Side by side on a phone, stacked from sm: up. */}
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:grid-cols-1 sm:grid-rows-2">
          <GalleryPhoto slide={secondaries[0]} sizes="(max-width: 1024px) 50vw, 16vw" />
          <GalleryPhoto slide={secondaries[1]} sizes="(max-width: 1024px) 50vw, 16vw" />
        </div>
      </div>
    );
  }

  // Four or more secondaries (five or more total): a real 2-per-row grid
  // beside the main photo, capped at four — desktop's cap on how many fit
  // beside one large photo without each shrinking past readable.
  const desktopSecondaries = secondaries.slice(0, 4);
  // Mobile's own, lower cap — see the file header for why this stays at
  // two regardless of how many desktop shows.
  const mobileCount = 2;

  return (
    <div className="grid h-128 grid-cols-2 grid-rows-[2fr_1fr] gap-2 sm:aspect-4/3 sm:h-auto sm:grid-cols-[2fr_1fr] sm:grid-rows-1">
      <GalleryPhoto
        slide={main}
        className="col-span-2 sm:col-span-1"
        sizes="(max-width: 1024px) 100vw, 32vw"
      />

      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:grid-rows-2">
        {desktopSecondaries.map((slide, index) => (
          <GalleryPhoto
            key={slide.src}
            slide={slide}
            sizes="(max-width: 1024px) 50vw, 16vw"
            className={[
              index >= mobileCount ? "hidden sm:block" : "",
              // An odd four-out-of-four leaves no gap; an odd three-out-of-
              // four's last tile spans the row instead of leaving one.
              desktopSecondaries.length % 2 === 1 && index === desktopSecondaries.length - 1
                ? "col-span-2"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
