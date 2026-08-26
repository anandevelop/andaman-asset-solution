"use client";

/**
 * components/HeroCarousel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Homepage hero: a calm Insta360-style carousel of full-bleed image/video
 * slides (HeroStorySlide, managed at /admin/hero-banner — schema, S3 and
 * the admin form are all unchanged from the original IG-Stories build,
 * only this presentation layer is new). Formerly StoryBanner.tsx; renamed
 * because the UX it now implements is a real carousel, not a Story:
 *
 *   - Explicit prev/next arrow buttons replace the old 30/40/30 tap zones.
 *   - The progress indicator is a row of fixed-length dashes rather than a
 *     full-width bar — each one still fills left-to-right as its slide
 *     plays (CSS animation for IMAGE, `onTimeUpdate` for VIDEO, same
 *     mechanics as the original build), it is just shorter and gapped
 *     instead of stretching edge to edge.
 *   - VIDEO slides always play muted, with no sound/mute toggle — every
 *     slide auto-advances on a timer regardless of user interaction, so an
 *     un-mutable, always-silent autoplay is the only option that can't
 *     surprise someone with sudden audio. Hovering no longer pauses
 *     playback either — the carousel just keeps advancing on its own
 *     timer no matter what the mouse is doing.
 *
 * Auto-advance timing is unchanged: an IMAGE slide holds for
 * durationSeconds (driven by the `story-progress` CSS animation in
 * globals.css, which also draws that slide's dash fill), a VIDEO slide
 * advances on its own `onEnded`.
 *
 * Client Component by necessity (state, timers, pointer/hover handlers),
 * but it never touches Prisma or next-intl's server APIs itself — the page
 * (app/[locale]/(site)/page.tsx) fetches and localizes the slides via
 * lib/hero-story.ts and hands this component a plain, already-translated
 * array, the same division of labour as FaqAccordion/lib/faqs.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import type { HeroStorySlide } from "@/lib/hero-story";

/**
 * Slide text/button entrance — Reveal (components/Reveal.tsx) is
 * scroll-triggered (whileInView, once: true) and deliberately doesn't
 * re-fire once the hero is already in view, so it can't animate a slide
 * change the way it animates a page load. This is the same fade + rise,
 * just driven by mount/unmount (AnimatePresence, keyed on slide.id) instead
 * of viewport visibility, so every slide change replays it.
 */
const textGroupVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const textItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

/** The plain static hero shown when there are no active slides at all. */
type FallbackHero = {
  imageUrl: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
};

/**
 * The second button ("Learn more") is a fixed, site-wide action, not
 * per-slide data — HeroStorySlide only carries one optional CTA (see
 * schema.prisma), which becomes the solid "Buy now"-style primary button
 * when a slide sets it. This keeps every slide showing at least one
 * action without touching the data model.
 */
type SecondaryCta = { label: string; href: string };

type Labels = {
  previousSlide: string;
  nextSlide: string;
};

type Props = {
  slides: HeroStorySlide[];
  fallback: FallbackHero;
  secondaryCta: SecondaryCta;
  labels: Labels;
};

export default function HeroCarousel({ slides, fallback, secondaryCta, labels }: Props) {
  if (slides.length === 0) {
    return <StaticFallbackHero {...fallback} />;
  }

  return <Carousel slides={slides} secondaryCta={secondaryCta} labels={labels} />;
}

/**
 * A slide's caption is a single optional text field — there is no separate
 * title/subheadline pair in the data model. Client-side only: the first
 * line (if any) reads as the big headline, everything after an explicit
 * line break reads as the smaller subheadline. A caption with no line
 * break is just a headline with no subheadline, which is the common case.
 */
function splitCaption(caption: string | null): { headline: string; subheadline: string } | null {
  if (!caption) return null;
  const [headline, ...rest] = caption.split("\n");
  return { headline: headline.trim(), subheadline: rest.join(" ").trim() };
}

function Carousel({
  slides,
  secondaryCta,
  labels,
}: {
  slides: HeroStorySlide[];
  secondaryCta: SecondaryCta;
  labels: Labels;
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  const slide = slides[index];
  const text = splitCaption(slide.caption);

  const goTo = useCallback(
    (next: number) => {
      setVideoProgress(0);
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  return (
    <section
      // Shorter on mobile — the old h-[88vh] left a long stretch of bare
      // video between the headline (pinned near the top) and the buttons
      // (pinned near the bottom), which read as "too tall" with mostly
      // empty space in the middle. Now that headline + buttons are grouped
      // into one block near the bottom (below), the section itself doesn't
      // need nearly as much height to hold them. sm: and up unchanged.
      className="relative h-[72vh] min-h-[520px] w-full overflow-hidden bg-primary-900 sm:h-[88vh] sm:min-h-[560px]"
    >
      {/* ── Media ─────────────────────────────────────────────────────── */}
      <div key={slide.id} className="absolute inset-0">
        {slide.mediaType === "VIDEO" ? (
          <video
            src={slide.mediaUrl}
            poster={slide.posterImageUrl ?? undefined}
            autoPlay
            muted
            playsInline
            loop={false}
            className="h-full w-full object-cover"
            onEnded={goNext}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0) {
                setVideoProgress((video.currentTime / video.duration) * 100);
              }
            }}
          />
        ) : (
          <Image
            src={slide.mediaUrl}
            alt=""
            fill
            priority={index === 0}
            sizes="100vw"
            className="object-cover"
          />
        )}
        {/* Bottom-up on every breakpoint — the content block sits centered
            just above the dash row now, not pinned to one side, so the
            darkened band needs to sit under it rather than off to the
            left. */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary-900/90 via-primary-900/25 to-primary-900/10" />
      </div>

      {/* ── Prev / next arrows ────────────────────────────────────────
          Small and low (near the dash row) on mobile; larger and
          vertically centered on the edges from `sm:` up. */}
      <button
        type="button"
        onClick={goPrev}
        aria-label={labels.previousSlide}
        className="absolute bottom-16 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-colors hover:bg-black/40 sm:bottom-auto sm:left-5 sm:top-1/2 sm:h-11 sm:w-11 sm:-translate-y-1/2"
      >
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden className="sm:hidden" />
        <ChevronLeft size={22} strokeWidth={1.75} aria-hidden className="hidden sm:block" />
      </button>

      <button
        type="button"
        onClick={goNext}
        aria-label={labels.nextSlide}
        className="absolute bottom-16 right-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-colors hover:bg-black/40 sm:bottom-auto sm:right-5 sm:top-1/2 sm:h-11 sm:w-11 sm:-translate-y-1/2"
      >
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="sm:hidden" />
        <ChevronRight size={22} strokeWidth={1.75} aria-hidden className="hidden sm:block" />
      </button>

      {/* ── Progress dashes — fixed-length, each one fills as its slide
          plays ───────────────────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center gap-3 sm:bottom-7 sm:gap-4">
        {slides.map((s, i) => (
          <div
            key={s.id}
            aria-hidden
            className="h-[2px] w-16 overflow-hidden rounded-full bg-white/30 sm:w-24"
          >
            <div
              className="h-full bg-white"
              style={
                i < index
                  ? { width: "100%" }
                  : i > index
                    ? { width: "0%" }
                    : slide.mediaType === "IMAGE"
                      ? {
                          width: "0%",
                          animationName: "story-progress",
                          animationDuration: `${Math.max(slide.durationSeconds, 1)}s`,
                          animationTimingFunction: "linear",
                          animationFillMode: "forwards",
                        }
                      : { width: `${videoProgress}%` }
              }
              onAnimationEnd={
                i === index && slide.mediaType === "IMAGE" ? goNext : undefined
              }
            />
          </div>
        ))}
      </div>

      {/* ── Mobile content: headline and buttons grouped together, just
          above the dash row — previously the headline sat pinned near the
          top and the buttons near the bottom, leaving a long stretch of
          bare video between them that read as disconnected. Each slide
          change replays the fade + rise below (see textGroupVariants). */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-4 px-6 text-center sm:hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            variants={textGroupVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="flex flex-col items-center gap-4"
          >
            {text && (
              <motion.div variants={textItemVariants}>
                <p className="max-w-sm whitespace-pre-line text-2xl font-light leading-[1.15] text-white">
                  {text.headline}
                </p>
                {text.subheadline && (
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/85">
                    {text.subheadline}
                  </p>
                )}
              </motion.div>
            )}

            <motion.div
              variants={textItemVariants}
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <HeroCarouselButtons slide={slide} secondaryCta={secondaryCta} />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Desktop content: centered horizontally between the two arrows,
          sitting just above the dash row ───────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-24 z-20 hidden flex-col items-center gap-6 px-20 text-center sm:flex lg:bottom-28 lg:px-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            variants={textGroupVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="flex flex-col items-center gap-6"
          >
            {text && (
              <motion.div variants={textItemVariants} className="max-w-2xl">
                <p className="whitespace-pre-line text-4xl font-light leading-[1.1] text-white lg:text-5xl">
                  {text.headline}
                </p>
                {text.subheadline && (
                  <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/85 lg:text-base">
                    {text.subheadline}
                  </p>
                )}
              </motion.div>
            )}

            <motion.div
              variants={textItemVariants}
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <HeroCarouselButtons slide={slide} secondaryCta={secondaryCta} />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/**
 * The button pair, shared between the mobile and desktop content blocks.
 *
 * Both are the same slim outline pill (border, transparent fill, fills
 * solid white on hover) — the minimal treatment used on the project detail
 * page's own hero ("Request private viewing"). The old pair used the
 * shared .btn-primary/.btn-outline classes with most of their properties
 * overridden (solid white box vs. a translucent dark chip), which reads
 * as a heavier, boxier style than the rest of the hero. Hierarchy between
 * the two now comes from border weight (80% vs 40% opacity) rather than
 * one being a filled block and the other a dark chip.
 */
function HeroCarouselButtons({
  slide,
  secondaryCta,
}: {
  slide: HeroStorySlide;
  secondaryCta: SecondaryCta;
}) {
  return (
    <>
      {slide.ctaLabel && slide.ctaUrl && (
        <Link
          href={slide.ctaUrl}
          className="group inline-flex items-center gap-2 rounded-full border border-white/80 px-7 py-3 text-sm font-medium uppercase tracking-wide text-white transition-colors duration-300 hover:bg-white hover:text-primary"
        >
          {slide.ctaLabel}
          <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1" />
        </Link>
      )}

      <Link
        href={secondaryCta.href}
        className="rounded-full border border-white/40 px-7 py-3 text-sm font-medium uppercase tracking-wide text-white transition-colors duration-300 hover:border-white hover:bg-white/10"
      >
        {secondaryCta.label}
      </Link>
    </>
  );
}

/**
 * No active slides — falls back to a plain, non-interactive hero using the
 * lead published project's photo, same content the homepage always showed
 * before this component existed. Keeps the page from ever rendering an
 * empty hero band. Unchanged from the original IG-Stories build.
 */
function StaticFallbackHero({
  imageUrl,
  eyebrow,
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  ctaSecondaryLabel,
  ctaSecondaryHref,
}: FallbackHero) {
  return (
    <section className="relative flex h-[88vh] min-h-[560px] w-full items-end overflow-hidden">
      <Image src={imageUrl} alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary-900/95 via-primary-900/50 to-primary-900/30" />

      <div className="container-luxe relative z-10 pb-20 sm:pb-28">
        <Reveal>
          <p className="eyebrow text-accent-200 tracking-widest uppercase">{eyebrow}</p>
        </Reveal>

        <Reveal delay={0.1}>
          <h1 className="mt-4 max-w-3xl whitespace-pre-line text-4xl font-light leading-[1.08] text-white sm:text-6xl lg:text-7xl">
            {title}
          </h1>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-white/90 sm:text-base">
            {subtitle}
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href={ctaHref}
              className="btn-primary !bg-accent !text-primary hover:!bg-accent-600 border-none"
            >
              {ctaLabel}
              <ArrowRight size={16} aria-hidden />
            </Link>

            <Link
              href={ctaSecondaryHref}
              className="btn-outline !border-white/50 !text-white hover:!border-white hover:!bg-white/10"
            >
              {ctaSecondaryLabel}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
