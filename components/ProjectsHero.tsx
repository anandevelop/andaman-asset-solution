"use client";

/**
 * components/ProjectsHero.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The hero atop /projects — a full-bleed photograph of the portfolio's own
 * first development, the three numbers that describe the portfolio, and a
 * shortcut bar down to the cards below.
 *
 * It was a heading on a light background. The page it introduces is a list
 * of villas, and a wall of type is a strange way to open it; this leads
 * with the product. See app/[locale]/(site)/projects/page.tsx, which owns
 * every fetch and every translation and hands this component plain,
 * already-localized strings and already-formatted numbers — the same
 * server/client division the old version had, and the reason `breadcrumb`
 * arrives as a ReactNode (components/Breadcrumb.tsx is an async server
 * component and cannot be rendered from inside here).
 *
 * The breadcrumb sits with the copy rather than floating at the top-left of
 * the photo the way /projects/[slug]'s does. That position measured 1.5:1
 * against this image — the white massing of the villa lands directly under
 * it. Down here it reads 4.8:1 on desktop, 5.2:1 on a phone, and the top of
 * the frame is left clean.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Image from "next/image";

export type ProjectShortcut = {
  slug: string;
  name: string;
  location: string;
  /** Already-localized status label. */
  status: string;
  /** UNDER_CONSTRUCTION gets the accent dot; everything else reads as
   *  pending, not active. */
  accentDot: boolean;
  /** Already formatted for the locale. */
  units: string;
  /** "villas" or "units", chosen by the caller from the property type. */
  unitsLabel: string;
  imageUrl: string | null;
};

export type HeroStat = {
  label: string;
  /** Already formatted for the locale. */
  value: string;
  /** Trailing unit — "developments", "units", "sq.m". */
  unit: string;
};

type Props = {
  breadcrumb: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** null falls the hero back to flat navy — no photo, no scrim. */
  image: { url: string; alt: string } | null;
  /** Names the development in the photograph. Hidden below lg:. */
  credit: { name: string; suffix: string } | null;
  stats: HeroStat[];
  /** Empty renders no bar at all — see the page for the two rules that
   *  empty it. */
  shortcuts: ProjectShortcut[];
  shortcutsLabel: string;
};

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

/**
 * Motion off, not merely faster. `y: 0` is spelled out rather than left
 * unset: framer-motion's own reduced-motion handling drops the transform
 * half of an animation and keeps the opacity half, which leaves an element
 * parked at its `hidden` offset — a hero sitting 24px low, forever. Naming
 * the end state means it cannot matter which path gets there.
 */
const still: Variants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

export default function ProjectsHero({
  breadcrumb,
  eyebrow,
  title,
  subtitle,
  image,
  credit,
  stats,
  shortcuts,
  shortcutsLabel,
}: Props) {
  /*
    framer-motion only drops transforms on its own under
    `<MotionConfig reducedMotion="user">`, which this app does not set, so
    the variants are swapped by hand instead of trusting a default that
    isn't there.
  */
  const reduced = useReducedMotion();
  const enter = reduced ? still : item;

  return (
    /*
      aspect-ratio and min-height together, and `w-full` alongside both —
      not optional. Left at `width:auto`, a box with an aspect-ratio and a
      min-height makes the browser solve for *width* from the ratio times
      the height (610 × 3/4 = 458px), and the hero silently grows wider
      than its container and gets its right edge clipped. No error, no
      warning. The ratios are a floor on the shape, and min-height is a
      floor under that: this hero carries copy, three figures and the
      shortcut bar, and on a short viewport a ratio alone squeezes them
      into each other.
    */
    <motion.section
      initial="hidden"
      // Not whileInView: this is the first thing on the page, so there is
      // no scroll for it to wait on.
      animate="visible"
      variants={container}
      className="relative isolate flex aspect-[3/4] min-h-[610px] w-full flex-col overflow-hidden bg-primary sm:aspect-[16/10] sm:min-h-[570px] lg:aspect-[2/1] lg:max-h-[740px] lg:min-h-[640px]"
    >
      {image && (
        <>
          {/*
            object-position 50% 58%: a phone crops this landscape photo to
            3:4, and on the default centre the villa slides out of frame.
            A per-project portrait crop would be the real fix, and that is
            a content job, not a code one.

            TODO: if the team ever wants to choose this photo in the admin
            rather than inherit the first project's, SiteSetting already
            holds key/value pairs — a `projects.heroImageUrl` row read here
            would override the default below without a schema change.
          */}
          <ImageWithSkeleton
            src={image.url}
            alt={image.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_58%]"
          />
          <div aria-hidden className="projects-hero-scrim absolute inset-0" />
        </>
      )}

      {/* flex-1 + justify-end pins the copy to the bottom of whatever
          height the ratio settles on, with the shortcut bar below it. */}
      <div className="container-luxe relative flex flex-1 flex-col justify-end pb-[18px] pt-5 sm:pb-6 lg:pb-[30px]">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0 max-w-[640px]">
            <motion.div
              variants={enter}
              className="mb-3.5 [text-shadow:0_1px_10px_rgba(4,29,44,.8)]"
            >
              {breadcrumb}
            </motion.div>

            <motion.div variants={enter} className="flex items-center gap-3.5">
              {/* accent-200, not the utility's own accent-700: that gold is
                  tuned for a light background and disappears on a photo. */}
              <p className="eyebrow shrink-0 text-accent-200 [text-shadow:0_1px_14px_rgba(4,29,44,.7)]">
                {eyebrow}
              </p>
              {/* Draws itself in after the eyebrow lands — a cue that the
                  next line is coming, not a fourth item in the stagger, so
                  it keeps its own delay. scaleX from origin-left rather
                  than width, so it runs on the GPU instead of laying out
                  every frame. */}
              <motion.span
                aria-hidden
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }
                }
                className="h-px max-w-[150px] flex-1 origin-left bg-accent-200/50"
              />
            </motion.div>

            <motion.h1
              variants={enter}
              className="mt-3 text-[clamp(34px,10vw,44px)] font-extralight leading-[1.06] tracking-[-0.01em] text-white [text-shadow:0_2px_26px_rgba(4,29,44,.45)] sm:text-[clamp(48px,6.2vw,72px)]"
            >
              {title}
            </motion.h1>

            <motion.p
              variants={enter}
              className="mt-3.5 max-w-[46ch] text-[14.5px] font-light leading-[1.78] text-white/85 [text-shadow:0_1px_14px_rgba(4,29,44,.7)] sm:text-[16.5px] sm:leading-[1.75]"
            >
              {subtitle}
            </motion.p>

            {/* One item in the stagger, not three: nine of them in a row
                turns the entrance into a minute-and-a-half-feeling
                sequence. Hairlines rather than boxes — a bordered card
                here would read as a panel sitting on the photo.
                max-w-[560px] so three columns inside a 640px column don't
                drift so far apart they stop reading as a set. */}
            {stats.length > 0 && (
              <motion.dl
                variants={enter}
                className="mt-5 grid max-w-[560px] grid-cols-3 border-t border-white/25"
              >
                {stats.map((stat, i) => (
                  <div
                    key={stat.label}
                    className={`min-w-0 pt-4 lg:pt-5 ${
                      i > 0 ? "border-l border-white/25 pl-3 sm:pl-[18px] lg:pl-7" : ""
                    }`}
                  >
                    {/* white/80, not the mockup's /66: that was measured
                        against Trinity Village's photo, and this hero shows
                        whichever project sorts first — on a brighter one
                        /66 lands at 3.9:1, under AA. Measured 5.0:1 here.
                        The photo is data-driven, so re-measure whenever the
                        first project changes. */}
                    <dt className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-white/80 [text-shadow:0_1px_14px_rgba(4,29,44,.7)] sm:text-[10px] sm:tracking-[0.2em]">
                      {stat.label}
                    </dt>
                    {/* The narrow sizes are not cosmetic: at 360px the third
                        column has ~104px for "92,353 sq.m" once the rule is
                        deducted, and at the desktop size the grid pushes
                        wider than its container and the unit gets clipped. */}
                    <dd className="mt-1.5 flex items-baseline gap-1.5 text-[22px] font-extralight leading-none text-white [text-shadow:0_1px_16px_rgba(4,29,44,.6)] sm:text-[26px] lg:text-[34px]">
                      {stat.value}
                      <span className="text-[11px] font-normal text-white/60 sm:text-xs">
                        {stat.unit}
                      </span>
                    </dd>
                  </div>
                ))}
              </motion.dl>
            )}
          </div>

          {/* A hero built on a real project's photograph should say whose
              photograph it is. Desktop only — on a phone the copy already
              runs the full width. */}
          {credit && (
            <motion.p
              variants={enter}
              className="hidden shrink-0 items-center gap-2 whitespace-nowrap border border-white/35 bg-primary-900/45 px-3.5 py-2 text-[11.5px] tracking-[0.06em] text-white backdrop-blur-md lg:flex"
            >
              {credit.name}
              <span className="text-white/60">· {credit.suffix}</span>
            </motion.p>
          )}
        </div>
      </div>

      {/* A table of contents for the grid below, not a second set of
          project cards: name, location, status, unit count and nothing
          else. Anything more and it starts competing with the real cards
          two scrolls down. */}
      {shortcuts.length > 0 && (
        <motion.nav
          variants={enter}
          aria-label={shortcutsLabel}
          className="relative z-[1] w-full"
        >
          {/* scroll-pl matching the container's own padding: `snap-start`
              aligns a card to the *scrollport* edge, which is the padding
              box, so without this the browser helpfully scrolls the first
              card's 20px of left padding away the moment the page settles
              and the row starts flush against the screen edge. */}
          <ul className="container-luxe flex snap-x snap-mandatory scroll-pl-5 gap-2.5 overflow-x-auto pb-5 [-ms-overflow-style:none] [scrollbar-width:none] sm:scroll-pl-8 sm:pb-6 lg:grid lg:grid-cols-3 lg:gap-3.5 lg:overflow-visible lg:pb-8 [&::-webkit-scrollbar]:hidden">
            {shortcuts.map((shortcut) => (
              <li
                key={shortcut.slug}
                /* 74% of a 900px frame is one 660px card filling the
                   viewport, which looks broken — half a card of overhang
                   is what tells a visitor the row scrolls.

                   min-w-0 is what makes that 74% hold: a flex item's
                   automatic minimum size is its min-content width, and the
                   longest location string ("Laguna Area (Ban
                   Don–Cherngtalay, Phuket)") pushed these to 292–393px on
                   a 390px screen, each card a different width. */
                className="min-w-0 flex-[0_0_74%] snap-start md:flex-[0_0_46%] lg:flex-auto"
              >
                <a
                  href={`#project-${shortcut.slug}`}
                  /* text-white declared here rather than inherited: left to
                     the section it picks up the body's ink and the name
                     vanishes into the dark card with nothing to show for
                     it. */
                  className="flex h-full items-center gap-3 border border-white/20 bg-primary-900/45 p-2.5 text-white backdrop-blur-[10px] transition-colors hover:border-accent/55 hover:bg-primary-900/60"
                >
                  {shortcut.imageUrl && (
                    <Image
                      src={shortcut.imageUrl}
                      alt=""
                      width={58}
                      height={58}
                      className="h-[58px] w-[58px] shrink-0 bg-primary-600 object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {shortcut.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-white/60">
                      {shortcut.location}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-white/80">
                      <span
                        aria-hidden
                        className={`block h-[5px] w-[5px] shrink-0 rounded-full ${
                          shortcut.accentDot ? "bg-accent-500" : "bg-primary-200"
                        }`}
                      />
                      <span className="truncate">{shortcut.status}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[19px] font-light leading-none">
                    {shortcut.units}
                    <span className="mt-0.5 block text-[10px] font-normal tracking-[0.12em] text-white/50">
                      {shortcut.unitsLabel}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </motion.nav>
      )}
    </motion.section>
  );
}
