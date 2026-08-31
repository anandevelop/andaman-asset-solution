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
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
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

type Labels = {
  previousSlide: string;
  nextSlide: string;
};

type Props = {
  slides: HeroStorySlide[];
  fallback: FallbackHero;
  labels: Labels;
  /**
   * Site-wide kicker above every slide's headline (home.hero.eyebrow).
   * Not per-slide data: HeroStorySlide carries one free-text caption and
   * nothing else, and asking an admin to retype a positioning line on
   * every slide is how that line ends up inconsistent.
   */
  eyebrow: string;
};

export default function HeroCarousel({ slides, fallback, labels, eyebrow }: Props) {
  if (slides.length === 0) {
    return <StaticFallbackHero {...fallback} />;
  }

  return (
    <Carousel
      slides={slides}
      labels={labels}
      eyebrow={eyebrow}
    />
  );
}

function Carousel({
  slides,
  labels,
  eyebrow,
}: {
  slides: HeroStorySlide[];
  labels: Labels;
  eyebrow: string;
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  const slide = slides[index];

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
          <ImageWithSkeleton
            src={slide.mediaUrl}
            alt=""
            fill
            priority={index === 0}
            sizes="100vw"
            className="object-cover"
            /* Runs for exactly this slide's hold time, so the move lands
               as the slide changes rather than stopping early and sitting
               still. The wrapping div is keyed on slide.id, so React
               remounts the element and the animation restarts each time. */
            style={{
              animationName: "hero-zoom",
              animationDuration: `${Math.max(slide.durationSeconds, 1)}s`,
              animationTimingFunction: "cubic-bezier(0.33, 0, 0.2, 1)",
              animationFillMode: "forwards",
              transformOrigin: "50% 55%",
            }}
          />
        )}
        {/*
          Shaped to the copy, not a wash — see the .hero-scrim comment in
          app/globals.css for the measurements and for why the earlier
          versions had to go. The second layer is `sm` and up only: it is
          the corner ellipse that sits under the left-aligned copy, and a
          phone has no such corner, since its copy is centred.
        */}
        <div className="hero-scrim absolute inset-0" />
        <div className="hero-scrim-side absolute inset-0 hidden sm:block" />
      </div>

      {/* ── Prev / next arrows ────────────────────────────────────────
          Phones keep them low on the left and right of the centered copy.

          From `sm:` up they pair off in the bottom-right corner instead of
          sitting vertically centered on the edges. Once the copy moved to
          the bottom-left, a centered left arrow landed on top of the CTA
          — caught by a collision check, not by eye, because the two only
          overlap at some viewport heights. Pairing them bottom-right
          removes the class of bug rather than nudging a magic number, and
          gives the frame three clean anchors: copy left, progress centre,
          controls right.

          Bare arrows now — no circle, no border, no blur backdrop. That
          chip read as its own UI element sitting on top of the photo;
          dropping it back to just the glyph is what "minimal" meant here.
          A drop-shadow on the icon stands in for the old backdrop's
          contrast job (keeping the arrow readable over a bright patch of
          sky or a light wall) without drawing a shape of its own. */}
      <button
        type="button"
        onClick={goPrev}
        aria-label={labels.previousSlide}
        className="absolute bottom-16 left-3 z-30 flex h-9 w-9 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-colors hover:text-white/70 sm:bottom-6 sm:left-auto sm:right-[4.75rem] sm:top-auto sm:h-12 sm:w-12 sm:translate-y-0"
      >
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden className="sm:hidden" />
        <ChevronLeft size={22} strokeWidth={1.75} aria-hidden className="hidden sm:block" />
      </button>

      <button
        type="button"
        onClick={goNext}
        aria-label={labels.nextSlide}
        className="absolute bottom-16 right-3 z-30 flex h-9 w-9 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-colors hover:text-white/70 sm:bottom-6 sm:right-5 sm:top-auto sm:h-12 sm:w-12 sm:translate-y-0"
      >
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="sm:hidden" />
        <ChevronRight size={22} strokeWidth={1.75} aria-hidden className="hidden sm:block" />
      </button>

      {/* ── Progress dashes — fixed-length, each one fills as its slide
          plays ───────────────────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center gap-3 sm:bottom-[2.1rem] sm:gap-4">
        {slides.map((s, i) => (
          <div
            key={s.id}
            aria-hidden
            className="h-[2px] w-14 overflow-hidden bg-white/25 sm:w-20"
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
            <motion.p
              variants={textItemVariants}
              className="text-[0.6875rem] font-medium uppercase tracking-widest2 text-accent"
            >
              {eyebrow}
            </motion.p>

            {slide.caption && (
              <motion.div variants={textItemVariants}>
                <p className="max-w-sm whitespace-pre-line text-3xl font-light leading-[1.1] tracking-[0.05em] text-white">
                  {slide.caption}
                </p>
              </motion.div>
            )}

            {slide.tagline && (
              <motion.p
                variants={textItemVariants}
                className="max-w-xs text-sm leading-relaxed text-white/85"
              >
                {slide.tagline}
              </motion.p>
            )}

            {slide.ctaLabel && slide.ctaUrl && (
              <motion.div
                variants={textItemVariants}
                className="flex flex-wrap items-center justify-center gap-3"
              >
                <HeroCarouselCta slide={slide} />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Desktop content ───────────────────────────────────────────
          Left-aligned on the site's own container, not centered between
          the arrows. Two reasons. It puts the copy over the shaded left
          of a typical frame and leaves the building — the thing being
          sold — unobscured on the right. And it is what the rest of the
          site does: every section heading, the horizon dividers
          (`ml-0`), and this component's own StaticFallbackHero are all
          left-aligned on container-luxe. The centered carousel was the
          one exception. */}
      <div className="absolute inset-x-0 bottom-24 z-20 hidden sm:block lg:bottom-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            variants={textGroupVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="container-luxe flex flex-col items-start gap-6 text-left"
          >
            <motion.p
              variants={textItemVariants}
              className="text-xs font-medium uppercase tracking-widest2 text-accent sm:text-sm"
            >
              {eyebrow}
            </motion.p>

            {slide.caption && (
              <motion.div variants={textItemVariants} className="max-w-2xl">
                {/*
                  Tracking held at 0.06em. This is the largest type on the
                  site and wants the air, but slide captions are free text
                  an admin writes in any of the four locales — and Thai
                  stacks tone marks over its base characters, which start
                  to read as detached from the glyph they belong to once
                  the tracking gets wide. Same call as the <h1> in
                  components/CompanyIntro.tsx.
                */}
                <p className="whitespace-pre-line text-5xl font-light leading-[1.04] tracking-[0.05em] text-white lg:text-6xl">
                  {slide.caption}
                </p>
              </motion.div>
            )}

            {slide.tagline && (
              <motion.p
                variants={textItemVariants}
                className="max-w-md text-sm leading-relaxed text-white/85 lg:text-base"
              >
                {slide.tagline}
              </motion.p>
            )}

            {slide.ctaLabel && slide.ctaUrl && (
              <motion.div
                variants={textItemVariants}
                className="flex flex-wrap items-center gap-4"
              >
                <HeroCarouselCta slide={slide} />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/**
 * The slide's own call to action, shared between the mobile and desktop
 * content blocks.
 *
 * Exactly one button, and it is entirely the admin's: label and link both
 * come from the row an editor fills in at /admin/hero-banner, and a slide
 * that leaves them blank renders no button at all — which is what the
 * field's own hint there ("Leave both blank for no button") has always
 * promised. This used to render a second, always-on button whose label
 * came from home.hero.ctaSecondary in messages/*.json, so the homepage
 * showed a button that appeared nowhere in the admin, and a slide with no
 * CTA configured still showed one. That mismatch is what this shape
 * fixes; a slide that wants to point at /contact says so in its own
 * Button link field.
 *
 * Built on the site's own .btn-hero (rounded-sm, px-7 py-3.5) — a glass
 * outline rather than a flat accent fill, since a solid saturated block
 * sitting on top of a hero photo read as too loud/competing with the
 * villa itself. Same class StaticFallbackHero's primary button uses.
 */
function HeroCarouselCta({ slide }: { slide: HeroStorySlide }) {
  if (!slide.ctaLabel || !slide.ctaUrl) return null;

  return (
    <Link
      href={slide.ctaUrl}
      className="btn-hero group"
    >
      {slide.ctaLabel}
      <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1" />
    </Link>
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
      <ImageWithSkeleton src={imageUrl} alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary-900/95 via-primary-900/50 to-primary-900/30" />

      <div className="container-luxe relative z-10 pb-20 sm:pb-28">
        <Reveal>
          <p className="eyebrow text-accent-200 tracking-widest uppercase">{eyebrow}</p>
        </Reveal>

        <Reveal delay={0.1}>
          {/* Deliberately not an <h1>: this is a marketing caption, and
              the Carousel path above renders the same slot as a <p>. The
              page's heading lives in components/CompanyIntro.tsx so it is
              present whether or not any hero slides are configured. */}
          <p className="mt-4 max-w-3xl whitespace-pre-line text-4xl font-light leading-[1.08] text-white sm:text-6xl">
            {title}
          </p>
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
              className="btn-hero"
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
