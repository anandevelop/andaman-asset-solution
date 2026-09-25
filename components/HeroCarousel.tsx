"use client";

/**
 * components/HeroCarousel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Homepage hero: full-bleed image/video slides (HeroStorySlide, managed at
 * /admin/pages/home/hero — schema, S3, the admin form and lib/hero-story.ts
 * are all unchanged; only this presentation layer is new).
 *
 * THE SLIDE CHANGE IS A "WINDOW"
 *
 * A narrow vertical slot with a sand edge appears mid-frame and opens like a
 * sliding door onto the next slide, over 1500ms (`windowInsets` below is the
 * mockup's own formula, not an approximation). It is driven by
 * requestAnimationFrame writing `clip-path` and the frame's edges straight to
 * the DOM: nothing about it goes through React state, so a re-render during
 * the 1.5s (the video progress bar ticks one) cannot fight it. Only the
 * layer being opened is clipped — never a `filter`, never a blur on the media.
 *
 * At most three layers exist at once, all keyed on slide.id so a slide keeps
 * the same DOM element as its role changes (next → current → previous):
 *
 *   previous  shrinks to scale(.96) beneath the opening window and keeps
 *             playing, so a <video> is not restarted when it goes under
 *   current   the slide on screen
 *   next      hidden with `visibility`, never `display:none` — next/image
 *             will not fetch an image that has no box
 *
 * The next layer exists so the window never opens onto an empty frame. It
 * mounts only after the first slide has loaded: an eager second image in the
 * initial HTML would compete with the LCP image for the same bandwidth. And
 * it is a real <ImageWithSkeleton> rather than `new Image().src = url` —
 * next/image loads a resized `/_next/image?url=…&w=…`, so warming the raw
 * URL would download the same picture twice, in two sizes. A video slide
 * preloads metadata and its poster only, never the file.
 *
 * Ken Burns is a slow zoom OUT (1.14 → 1.02) that runs for the slide's hold
 * time plus the window, so it is still moving while the next slide opens. No
 * parallax follows the pointer — the client asked for that to go.
 *
 * COPY
 *
 * Old copy fades over the first half-second; at 500ms the new slide's text is
 * swapped in and enters: headline lines rise through a mask, the eyebrow rule
 * grows, tagline and button lift. All of it is CSS transitions keyed off one
 * data-phase attribute, so the global prefers-reduced-motion rule collapses it
 * without any code here. The headline is a <p>, not an <h1>: the page's one h1
 * lives in CompanyIntro.tsx (tests/routes.test.ts enforces it).
 *
 * The top-left label and the corner rail come from `slide.label`, stored as
 * "Trinity Village · Cherngtalay" — the part before the first " · " is the
 * name, the rest the description. The rail replaced the arrows, dashes and
 * counter; the counter survives as an sr-only live region.
 *
 * WHAT COSTS NOTHING WHEN NOBODY IS LOOKING
 *
 * One IntersectionObserver feeds both decorations. The glint is a single
 * skewed strip moved with `transform` — the mockup animated
 * `background-position` under `mix-blend-mode`, which repaints the whole hero
 * every frame for as long as the page is open. The dust canvas exists only at
 * ≥768px on machines reporting more than four cores, and its loop stops when
 * the hero scrolls out or the tab is hidden. Neither renders at all under
 * prefers-reduced-motion.
 *
 * REDUCED MOTION AND AUTO-ADVANCE
 *
 * The global reduced-motion rule (app/globals.css) shrinks every animation to
 * ~0ms, and an IMAGE slide used to advance on the `animationend` of its
 * progress bar — so under reduced motion that event never came, and the
 * carousel simply stopped on slide one (measured on the previous build: still
 * "01 / 03" after 14s, against a change every 5s otherwise). Reduced motion
 * now advances on a timer instead, and the change is instant.
 *
 * A change requested while the window is still opening is dropped when it
 * comes from a click, and queued when it comes from the timer: an admin may
 * set a slide to 1s, shorter than the window, and a dropped auto-advance
 * would leave the carousel stopped for good.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import type { HeroStorySlide } from "@/lib/hero-story";

/** The window opens over this long; the old layer shrinks and the outgoing
 *  Ken Burns keeps running for the same span. */
const WINDOW_MS = 1500;
/** Copy leaves at once and the next slide's copy is swapped in here. */
const COPY_SWAP_MS = 500;
/** The top-left label changes text a little earlier than the copy does. */
const LABEL_SWAP_MS = 400;

/** Where the window starts: 4% wide, 8% tall, dead centre. Same numbers
 *  `windowInsets(0)` returns, so the first painted frame is the first frame
 *  of the animation and not a flash of the whole new slide. */
const WINDOW_START_CLIP = "inset(46% 48% 46% 48%)";

/** Legibility over sky and white walls, where most of these frames put type.
 *  rgba(4,29,44) is primary-900. */
const TEXT_SHADOW = "[text-shadow:0_1px_8px_rgba(4,29,44,0.75)]";

/**
 * The window's insets at progress k ∈ [0, 1], as percentages.
 *
 * `v` is the top and bottom inset, `h` the left and right. The slot rises to
 * full height first (0 → 0.35, ease-out), then opens sideways (0.30 → 1,
 * ease-in-out) — the two overlap a little so it never stalls between them.
 * Taken verbatim from the mockup's `win.frame`.
 */
export function windowInsets(k: number): { v: number; h: number } {
  const a = Math.min(k / 0.35, 1);
  const b = Math.max((k - 0.3) / 0.7, 0);
  const easeOut = 1 - Math.pow(1 - a, 3);
  const easeInOut = b < 0.5 ? 4 * b * b * b : 1 - Math.pow(-2 * b + 2, 3) / 2;

  return {
    v: (46 - 46 * easeOut) * (1 - easeInOut),
    h: 48 - 48 * easeInOut,
  };
}

/**
 * Headline sizes, largest first. `box` is the headline's max width in em
 * (18ch, 24ch, 32ch ≈ 10, 13.4, 17.9em of Roboto) and `rows` how many wrapped
 * rows the size is allowed before the next one down is used. The last has no
 * limit: something has to take the caption however long it is.
 *
 * The block is anchored at the bottom, so it grows upward — and a caption
 * that ran to five rows at 92px went out of the top of the hero and under the
 * navbar. Ordinary captions ("Land chosen first." over two lines) stay at the
 * full size; only a long one steps down.
 */
const HEADLINE_TIERS = [
  { box: 10, rows: 3, className: "max-w-[18ch] text-[length:clamp(40px,6.4vw,92px)]" },
  { box: 13.4, rows: 4, className: "max-w-[24ch] text-[length:clamp(32px,4.8vw,64px)]" },
  { box: 17.9, rows: Infinity, className: "max-w-[32ch] text-[length:clamp(26px,3.4vw,46px)]" },
] as const;

const CJK = /[⺀-鿿豈-﫿＀-￯]/;
const THAI = /[฀-๿]/;
// Vowels and tone marks stacked above or below a Thai base letter: no advance.
const THAI_COMBINING = /[ัิ-ฺ็-๎]/;
const CAPITAL = /[A-ZА-ЯЁ]/;

/** A line's width in em, near enough to choose a size with. The four locales
 *  differ most: a CJK character is a full em, a Thai one half of that. */
function emWidth(line: string): number {
  let width = 0;

  for (const char of line) {
    if (THAI_COMBINING.test(char)) continue;
    if (CJK.test(char)) width += 1;
    else if (/\s/.test(char)) width += 0.28;
    else if (CAPITAL.test(char)) width += 0.7;
    else if (THAI.test(char)) width += 0.5;
    else width += 0.56;
  }

  return width;
}

/** The index into HEADLINE_TIERS for a caption's lines. */
export function headlineTier(lines: string[]): number {
  const widths = lines.map(emWidth);
  const tier = HEADLINE_TIERS.findIndex(
    ({ box, rows }) => widths.reduce((sum, w) => sum + Math.ceil(w / box), 0) <= rows,
  );

  return tier === -1 ? HEADLINE_TIERS.length - 1 : tier;
}

/** A media query as React state. useSyncExternalStore rather than an effect
 *  that sets state: it is correct on the server (false) and again after
 *  hydration, and it re-renders when the setting changes. */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const noSubscription = () => () => {};

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
  /**
   * Still passed by the page, no longer read: they named the two arrow
   * buttons, and the rail replaced those. Kept in the type so the call site
   * did not have to change in the same commit.
   */
  labels: Labels;
  /**
   * Site-wide kicker above every slide's headline (home.hero.eyebrow).
   * Not per-slide data: HeroStorySlide carries one free-text caption and
   * nothing else, and asking an admin to retype a positioning line on
   * every slide is how that line ends up inconsistent.
   */
  eyebrow: string;
  /** home.hero.scroll — the word beside the drip at the bottom centre. */
  scrollLabel: string;
};

export default function HeroCarousel({ slides, fallback, eyebrow, scrollLabel }: Props) {
  if (slides.length === 0) {
    return <StaticFallbackHero {...fallback} />;
  }

  return <Carousel slides={slides} eyebrow={eyebrow} scrollLabel={scrollLabel} />;
}

type Transition = { from: number; to: number };
type CopyPhase = "hidden" | "in" | "out";
type LayerRole = "current" | "previous" | "next";

function Carousel({
  slides,
  eyebrow,
  scrollLabel,
}: {
  slides: HeroStorySlide[];
  eyebrow: string;
  scrollLabel: string;
}) {
  const count = slides.length;

  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const wide = useMediaQuery("(min-width: 768px)");
  // Four cores or fewer is a phone or an old laptop: the dust would cost more
  // than it is worth. A browser that does not say is given the benefit.
  const capable = useSyncExternalStore(
    noSubscription,
    () => (navigator.hardwareConcurrency ?? 8) > 4,
    () => false,
  );

  const [index, setIndex] = useState(0);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [copyIndex, setCopyIndex] = useState(0);
  const [copyPhase, setCopyPhase] = useState<CopyPhase>("hidden");
  const [labelIndex, setLabelIndex] = useState(0);
  const [labelSwapping, setLabelSwapping] = useState(false);
  const [preloadNext, setPreloadNext] = useState(false);
  const [inView, setInView] = useState(true);

  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Refs, not state, for what a timer or animation callback must read fresh.
  const indexRef = useRef(0);
  const busyRef = useRef(false);
  const pendingAdvanceRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  const goTo = useCallback(
    (target: number) => {
      if (count < 2 || busyRef.current) return;

      const next = ((target % count) + count) % count;
      const from = indexRef.current;
      if (next === from) return;

      indexRef.current = next;
      setVideoProgress(0);
      setIndex(next);

      if (reduced) {
        // No window, no fade: the new slide and its copy are simply there.
        setCopyIndex(next);
        setLabelIndex(next);
        setCopyPhase("in");
        return;
      }

      busyRef.current = true;
      setTransition({ from, to: next });
      setCopyPhase("out");
      setLabelSwapping(true);

      later(() => {
        setLabelIndex(next);
        setLabelSwapping(false);
      }, LABEL_SWAP_MS);

      later(() => {
        setCopyIndex(next);
        setCopyPhase("hidden");
        // Two frames, so the hidden state is painted before "in" is set —
        // otherwise React batches them and the entrance never transitions.
        requestAnimationFrame(() => requestAnimationFrame(() => setCopyPhase("in")));
      }, COPY_SWAP_MS);
    },
    [count, reduced, later],
  );

  // Latest goTo for the callbacks that outlive a render.
  const goToRef = useRef(goTo);
  useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);

  /** Timer / progress-bar / video-ended: go on to the next slide, or queue it
   *  if the window is still opening (see the header). */
  const advance = useCallback(() => {
    if (count < 2) return;

    if (busyRef.current) {
      pendingAdvanceRef.current = true;
      return;
    }

    goTo(indexRef.current + 1);
  }, [count, goTo]);

  // ── The window ───────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!transition) return;

    const layer = layerRefs.current[slides[transition.to].id];
    const frame = frameRef.current;
    let raf = 0;

    const finish = () => {
      if (layer) layer.style.clipPath = "";
      if (frame) frame.style.opacity = "0";
      busyRef.current = false;
      setTransition(null);

      if (pendingAdvanceRef.current) {
        pendingAdvanceRef.current = false;
        goToRef.current(indexRef.current + 1);
      }
    };

    if (!layer) {
      raf = requestAnimationFrame(finish);
      return () => cancelAnimationFrame(raf);
    }

    const width = layer.offsetWidth;
    const height = layer.offsetHeight;

    const paint = (k: number) => {
      const { v, h } = windowInsets(k);

      layer.style.clipPath = `inset(${v}% ${h}% ${v}% ${h}%)`;

      if (frame) {
        // The frame sits on the window's edge, but it is placed with a
        // transform and sized with width/height from a fixed origin — never
        // with top/left/right/bottom. Those are layout: the browser counts
        // every frame of them as a layout shift, on every slide change, for
        // as long as the page is open.
        const x = (h / 100) * width;
        const y = (v / 100) * height;
        frame.style.transform = `translate(${x}px, ${y}px)`;
        frame.style.width = `${width - 2 * x}px`;
        frame.style.height = `${height - 2 * y}px`;
        // Solid until the very end, then gone with the last of the opening.
        frame.style.opacity = String(k < 0.88 ? 1 : (1 - k) / 0.12);
      }
    };

    // Before the first paint, so the frame is never seen unplaced.
    paint(0);

    const t0 = performance.now();

    const step = (now: number) => {
      // The rAF timestamp is the frame's start, which can be a hair before
      // the moment this effect read the clock.
      const k = Math.max(0, Math.min((now - t0) / WINDOW_MS, 1));
      paint(k);

      if (k < 1) raf = requestAnimationFrame(step);
      else finish();
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [transition, slides]);

  // ── Mount: the first entrance, and the timers' cleanup ───────────────────
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setCopyPhase("in"));
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  useEffect(() => {
    const timers = timersRef;
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, []);

  // Preload the next slide once the first has loaded — and after a while
  // regardless, in case a slide-one <video> never says it has.
  useEffect(() => {
    if (count < 2) return;
    const id = window.setTimeout(() => setPreloadNext(true), 2500);
    return () => window.clearTimeout(id);
  }, [count]);

  // One observer for everything that should stop when the hero is off screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const slide = slides[index];

  // Reduced motion: the progress bar's animationend never comes (see the
  // header), so an IMAGE slide advances on a timer. A VIDEO slide still goes
  // on its own `ended`.
  useEffect(() => {
    if (!reduced || count < 2 || slide.mediaType !== "IMAGE") return;

    const id = window.setTimeout(
      () => goToRef.current(indexRef.current + 1),
      Math.max(slide.durationSeconds, 1) * 1000,
    );

    return () => window.clearTimeout(id);
  }, [reduced, count, index, slide.mediaType, slide.durationSeconds]);

  const nextIndex = count > 1 && preloadNext ? (index + 1) % count : null;

  const roleOf = (i: number): LayerRole | null => {
    if (i === index) return "current";
    if (transition?.from === i) return "previous";
    if (i === nextIndex) return "next";
    return null;
  };

  const handleRailKey = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
  };

  const copySlide = slides[copyIndex];
  const labelSlide = slides[labelIndex];
  const showDust = wide && capable && !reduced;
  // Past four slides the rail gives up its descriptions and shares the width.
  const compactRail = count > 4;

  return (
    <section
      ref={sectionRef}
      // Shorter on mobile — a long stretch of bare picture between the copy
      // and the controls read as empty. The copy is grouped near the bottom
      // now, so the section needs less height to hold it. sm: and up unchanged.
      className="relative h-[72vh] min-h-[520px] w-full overflow-hidden bg-primary-900 sm:h-[88vh] sm:min-h-[560px]"
    >
      {/* ── Media ─────────────────────────────────────────────────────── */}
      {slides.map((s, i) => {
        const role = roleOf(i);
        if (!role) return null;

        return (
          <SlideLayer
            key={s.id}
            slide={s}
            role={role}
            opening={transition?.to === i}
            priority={i === 0}
            register={(el) => {
              layerRefs.current[s.id] = el;
            }}
            onAdvance={advance}
            onProgress={setVideoProgress}
            onFirstLoad={i === 0 ? () => setPreloadNext(true) : undefined}
          />
        );
      })}

      {/* The window's sand edge. Rendered only while one is opening; its
          size and position are written by the animation loop above, not by
          props. Invisible until that first write. */}
      {transition && !reduced && (
        <div
          ref={frameRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-[3] border border-[rgba(243,213,179,0.95)] opacity-0 shadow-[0_0_24px_rgba(232,179,132,0.35)]"
        />
      )}

      {/*
        Shaped to the copy, not a wash — see the .hero-scrim comment in
        app/globals.css for the measurements and for why the earlier
        versions had to go. One overlay above every layer rather than one per
        slide, so it does not open with the window. The second layer is `sm`
        and up only: it is the corner ellipse under the left-aligned copy.
      */}
      <div className="hero-scrim pointer-events-none absolute inset-0 z-[3]" />
      <div className="hero-scrim-side pointer-events-none absolute inset-0 z-[3] hidden sm:block" />

      {/* ── Decoration (all aria-hidden, none of it clickable) ───────────── */}
      {!reduced && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
          <div
            className="absolute -top-[20%] left-0 h-[140%] w-[45%] will-change-transform"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(243,213,179,0.22) 50%, transparent)",
              transform: "translateX(-60%) skewX(-14deg)",
              animation: "hero-glint 7s ease-in-out infinite",
              animationPlayState: inView ? "running" : "paused",
            }}
          />
        </div>
      )}

      {showDust && <HeroDust active={inView} />}

      {/* ── Slide label ───────────────────────────────────────────────
          Which development is on screen, credited above the pitch rather
          than inside it. Renders nothing when the slide has no label — a
          general mood shot belongs to no project and should not be made to
          claim one. Hidden on phones, where there is no corner for it. */}
      {labelSlide.label && (
        <div className="absolute inset-x-0 top-[18%] z-20 max-[900px]:hidden">
          <div
            className={`container-luxe flex items-center gap-[14px] text-xs font-normal uppercase tracking-widest2 text-white ${TEXT_SHADOW}`}
          >
            <span aria-hidden className="h-px w-10 bg-white/70" />
            <span
              className={`inline-block transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                labelSwapping ? "-translate-y-[10px] opacity-0 blur-[6px]" : ""
              }`}
            >
              {labelSlide.label}
            </span>
          </div>
        </div>
      )}

      {/* ── Copy ───────────────────────────────────────────────────────── */}
      <HeroCopy slide={copySlide} eyebrow={eyebrow} phase={copyPhase} />

      {/* ── Scroll cue ─────────────────────────────────────────────────
          xl and up, and only while the rail leaves the middle free: four
          slides make the rail 764px wide, which reaches past the centre of
          any container this wide and would sit the cue on top of it. */}
      {count <= 3 && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[46px] left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-[10px] opacity-70 xl:flex"
        >
          <span
            className={`text-[10px] leading-none font-normal uppercase tracking-[0.3em] text-white ${TEXT_SHADOW}`}
          >
            {scrollLabel}
          </span>
          <span className="relative block h-[46px] w-px overflow-hidden bg-linear-to-b from-transparent to-white">
            <span
              className="absolute top-[-40%] left-0 block h-[40%] w-px bg-accent"
              // Moves by transform, not `top` — see the hero-scroll-drip
              // comment in app/globals.css.
              style={{
                animation: "hero-scroll-drip 2.2s cubic-bezier(0.16,1,0.3,1) infinite",
                animationPlayState: inView ? "running" : "paused",
              }}
            />
          </span>
        </div>
      )}

      {/* ── Rail ──────────────────────────────────────────────────────────
          The project list, bottom right, and the only control: it replaced
          the arrows, the dashes and the counter. A single slide has nothing
          to choose between, so it gets none of this. */}
      {count > 1 && (
        <div className="absolute inset-x-0 bottom-12 z-30 max-[900px]:bottom-[78px]">
          <div className="container-luxe flex justify-end">
            {/* Position, for a screen reader: everything else in the rail is
                a button naming its own slide, and none says which is playing
                once the fill has finished. */}
            <p aria-live="polite" className="sr-only">
              {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </p>

            <ol
              onKeyDown={handleRailKey}
              className={`m-0 flex list-none gap-7 p-0 text-white ${TEXT_SHADOW} max-[900px]:w-full max-[900px]:gap-[14px] ${
                compactRail ? "w-full max-w-[764px]" : ""
              }`}
            >
              {slides.map((s, i) => {
                const [name, ...rest] = (s.label ?? "").split(" · ");
                const description = rest.join(" · ");
                const number = String(i + 1).padStart(2, "0");
                const isCurrent = i === index;

                return (
                  <li
                    key={s.id}
                    className={
                      compactRail
                        ? "min-w-0 flex-1"
                        : "w-[170px] max-[900px]:min-w-0 max-[900px]:w-auto max-[900px]:flex-1"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={name ? `${number} ${s.label}` : number}
                      aria-current={isCurrent ? "true" : undefined}
                      className={`block w-full text-left transition-opacity duration-[400ms] hover:opacity-100 focus-visible:opacity-100 ${
                        isCurrent ? "opacity-100" : "opacity-[0.55]"
                      }`}
                    >
                      <RailBar
                        state={i < index ? "done" : isCurrent ? "current" : "pending"}
                        slide={s}
                        videoProgress={videoProgress}
                        onEnded={reduced ? undefined : advance}
                      />
                      <span className="block text-[11px] leading-none tracking-[0.2em] text-accent">
                        {number}
                      </span>
                      {name && (
                        <span
                          className={`mt-1.5 block text-xs leading-[1.3] uppercase tracking-[0.18em] max-[900px]:truncate max-[900px]:text-[10px] max-[900px]:tracking-[0.12em] ${
                            compactRail ? "truncate" : ""
                          }`}
                        >
                          {name}
                        </span>
                      )}
                      {description && !compactRail && (
                        <span className="mt-1 block text-[13px] opacity-70 max-[900px]:hidden">
                          {description}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * One layer of the stack: the slide's media, and how it sits in the window
 * animation for its current role.
 *
 * The layer element is the same one from the moment it mounts as `next` to
 * the moment it is dropped as `previous` (Carousel keys it on slide.id), so
 * the browser keeps its decoded image, or its playing video, throughout.
 */
function SlideLayer({
  slide,
  role,
  opening,
  priority,
  register,
  onAdvance,
  onProgress,
  onFirstLoad,
}: {
  slide: HeroStorySlide;
  role: LayerRole;
  /** This layer is the one the window is opening right now. */
  opening: boolean;
  /** First slide only — the LCP image. */
  priority: boolean;
  register: (el: HTMLDivElement | null) => void;
  onAdvance: () => void;
  onProgress: (percent: number) => void;
  onFirstLoad?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // A video is on screen from the top or not at all. One arriving as `next`
  // has loaded but not started; one going round again may have been left
  // mid-way by a click (the layer under the window keeps playing, and with
  // two slides it comes straight back as `next`), where play() would carry on
  // from wherever it stopped. So `next` parks it at the start, and only
  // `current` plays.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (role === "current") {
      void Promise.resolve(video.play()).catch(() => {});
    } else if (role === "next") {
      video.pause();
      video.currentTime = 0;
    }
  }, [role]);

  const layerStyle: CSSProperties =
    role === "previous"
      ? {
          // Sinks a little as the window opens over it, which gives the
          // change some depth.
          transform: "scale(0.96)",
          transition: "transform 1500ms cubic-bezier(0.65, 0, 0.35, 1)",
        }
      : role === "current" && opening
        ? { clipPath: WINDOW_START_CLIP, willChange: "clip-path" }
        : {};

  // Zoom-out for the slide's hold time plus the window. It is on the
  // outgoing layer too, so the picture keeps moving while it is covered; it
  // is off for `next`, so it starts when the slide becomes visible.
  const zoomStyle: CSSProperties =
    role === "next"
      ? { transformOrigin: "60% 55%" }
      : {
          animationName: "hero-zoom-out",
          animationDuration: `${Math.max(slide.durationSeconds, 1) + WINDOW_MS / 1000}s`,
          animationTimingFunction: "cubic-bezier(0.33, 0, 0.2, 1)",
          animationFillMode: "forwards",
          transformOrigin: "60% 55%",
        };

  return (
    <div
      ref={register}
      className={`absolute inset-0 ${
        role === "current" ? "z-[2]" : role === "previous" ? "z-[1]" : "invisible z-0"
      }`}
      style={layerStyle}
    >
      {slide.mediaType === "VIDEO" ? (
        <video
          ref={videoRef}
          src={slide.mediaUrl}
          poster={slide.posterImageUrl ?? undefined}
          autoPlay={role === "current"}
          // Metadata and the poster only until it is this one's turn.
          preload={role === "next" ? "metadata" : "auto"}
          muted
          playsInline
          loop={false}
          className="h-full w-full object-cover"
          // Only the slide on screen may end the slide or move its bar: the
          // one going under the window is still playing, and its ticks would
          // otherwise overwrite the new slide's progress.
          onEnded={role === "current" ? onAdvance : undefined}
          onTimeUpdate={
            role === "current"
              ? (event) => {
                  const video = event.currentTarget;
                  if (video.duration > 0) onProgress((video.currentTime / video.duration) * 100);
                }
              : undefined
          }
          onLoadedData={onFirstLoad}
        />
      ) : (
        <ImageWithSkeleton
          src={slide.mediaUrl}
          alt=""
          fill
          priority={priority}
          // Everything but the first is wanted within seconds, and a lazy
          // image inside a layer that is hidden or clipped would wait.
          loading="eager"
          sizes="100vw"
          className="object-cover"
          style={zoomStyle}
          onLoad={onFirstLoad}
        />
      )}
    </div>
  );
}

/**
 * The slide's copy: eyebrow, headline, tagline and button, entering through
 * `data-phase`. Every child transitions from its hidden state to its shown
 * one when the phase becomes "in", with the delays below; keyed on the slide
 * so a new slide's copy always starts hidden.
 *
 * The headline is split on newlines and each line rides up through its own
 * overflow mask. Thai is why the mask has padding and the matching negative
 * margin: overflow-hidden clips at the line box, which is shorter than the
 * tone marks and upper vowels stacked above the base letters.
 */
function HeroCopy({
  slide,
  eyebrow,
  phase,
}: {
  slide: HeroStorySlide;
  eyebrow: string;
  phase: CopyPhase;
}) {
  const lines = (slide.caption ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div
      data-phase={phase}
      // Ends at 22% of the frame's height rather than a fixed offset from the
      // bottom: a fixed offset put the button on top of the rail on a short
      // laptop screen while leaving a gap on a tall monitor. Phones end it
      // just above the rail instead.
      //
      // Pinned at the top too, with the copy bottom-aligned inside. A box
      // anchored only at the bottom takes its height from its content, so its
      // top edge moved every time a slide's copy was taller or shorter than
      // the last — a layout shift on each slide change (the old carousel
      // had the same one, 0.006). The box is now the same size for every slide.
      className="group/copy pointer-events-none absolute inset-x-0 top-0 bottom-[22%] z-20 flex flex-col justify-end max-[900px]:bottom-[170px]"
    >
      <div
        key={slide.id}
        className={`container-luxe transition-opacity duration-[400ms] ${
          phase === "out" ? "opacity-0" : ""
        }`}
      >
        <p
          className={`mb-[22px] flex items-center gap-[14px] text-xs font-medium uppercase tracking-widest2 text-accent ${TEXT_SHADOW}`}
        >
          {/* Grows with scaleX from a rule that already has its 48px box.
              Animating `width` instead pushes the eyebrow text along beside
              it, one layout shift per frame. */}
          <i
            aria-hidden
            className="block h-px w-12 origin-left scale-x-0 bg-accent transition-transform delay-200 duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[phase=in]/copy:scale-x-100"
          />
          <span className="opacity-0 transition-opacity duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[phase=in]/copy:opacity-100">
            {eyebrow}
          </span>
        </p>

        {lines.length > 0 && (
          /*
            Tracking held at 0.05em (tracking-wider). This is the largest type
            on the site and wants the air, but slide captions are free text
            an admin writes in any of the four locales — and Thai stacks tone
            marks over its base characters, which start to read as detached
            from the glyph they belong to once the tracking gets wide. Same
            call as the <h1> in components/CompanyIntro.tsx.
          */
          <p
            className={`${HEADLINE_TIERS[headlineTier(lines)].className} leading-[1.04] font-light tracking-wider text-white`}
          >
            {lines.map((line, i) => (
              <span
                key={i}
                className="-mt-[0.14em] -mb-[0.1em] block overflow-hidden pt-[0.14em] pb-[0.1em]"
              >
                <span
                  className="inline-block translate-y-[110%] transition-transform duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[phase=in]/copy:translate-y-0"
                  style={{ transitionDelay: `${Math.min(i, 3) * 120}ms` }}
                >
                  {line}
                </span>
              </span>
            ))}
          </p>
        )}

        {slide.tagline && (
          <p
            className={`mt-[26px] max-w-[440px] translate-y-4 text-[17px] leading-[1.65] text-white/[0.86] opacity-0 transition-all delay-[350ms] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[phase=in]/copy:translate-y-0 group-data-[phase=in]/copy:opacity-100 ${TEXT_SHADOW}`}
          >
            {slide.tagline}
          </p>
        )}

        {slide.ctaLabel && slide.ctaUrl && (
          <div className="pointer-events-auto mt-[34px] flex translate-y-4 flex-wrap items-center gap-x-[22px] gap-y-[14px] opacity-0 transition-all delay-500 duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[phase=in]/copy:translate-y-0 group-data-[phase=in]/copy:opacity-100">
            <HeroCarouselCta slide={slide} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One rail progress bar.
 *
 * The fill logic — done / not started / animating on a timer / following a
 * video's currentTime — is fiddly enough that it lives in one place. The
 * playing bar is accent and the finished ones white: the rail then says
 * "this one" as well as "this many".
 *
 * `onEnded` is the IMAGE auto-advance: the `story-progress` animation ends
 * when the slide's hold time is up. Carousel passes nothing under reduced
 * motion, where that animation is collapsed to ~0ms and would end at once.
 */
function RailBar({
  state,
  slide,
  videoProgress,
  onEnded,
}: {
  state: "done" | "current" | "pending";
  slide: HeroStorySlide;
  videoProgress: number;
  onEnded?: () => void;
}) {
  const style: CSSProperties =
    state === "done"
      ? { width: "100%" }
      : state === "pending"
        ? { width: "0%" }
        : slide.mediaType === "IMAGE"
          ? {
              width: "0%",
              animationName: "story-progress",
              animationDuration: `${Math.max(slide.durationSeconds, 1)}s`,
              animationTimingFunction: "linear",
              animationFillMode: "forwards",
            }
          : { width: `${videoProgress}%` };

  return (
    <span aria-hidden className="mb-3 block h-[2px] overflow-hidden bg-white/[0.22]">
      <span
        className={`block h-full ${state === "current" ? "bg-accent" : "bg-white"}`}
        style={style}
        onAnimationEnd={state === "current" && slide.mediaType === "IMAGE" ? onEnded : undefined}
      />
    </span>
  );
}

type Particle = { x: number; y: number; r: number; v: number; a: number };

/**
 * Sand-coloured motes drifting up the frame.
 *
 * The parent decides whether this exists at all (wide screen, enough cores,
 * no reduced motion). What it decides here is when to draw: the loop runs
 * only while `active` (the hero is on screen) and the tab is visible, and is
 * cancelled otherwise — a canvas repainting for a page nobody is looking at
 * is the cost this component exists to avoid.
 *
 * Sized to its own box, capped at 2× pixel density, at most 70 motes.
 */
function HeroDust({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);

      particlesRef.current = Array.from({ length: Math.min(70, Math.round(width / 22)) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() * 1.4 + 0.4) * dpr,
        v: (Math.random() * 0.25 + 0.05) * dpr,
        a: Math.random() * Math.PI * 2,
      }));
    };

    build();

    let debounce = 0;
    const onResize = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(build, 200);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(debounce);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !active) return;

    let raf = 0;
    let running = false;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // accent-200. One fill colour, with the alpha set per mote — a fresh
      // rgba() string per mote per frame is seventy parses a frame.
      ctx.fillStyle = "rgb(243, 213, 179)";

      for (const p of particlesRef.current) {
        p.y -= p.v;
        p.a += 0.01;
        p.x += Math.sin(p.a) * 0.3;
        if (p.y < -5) p.y = canvas.height + 5;

        ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(p.a));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(draw);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full opacity-80"
    />
  );
}

/**
 * The slide's own call to action.
 *
 * Exactly one button, and it is entirely the admin's: label and link both
 * come from the row an editor fills in at /admin/pages/home/hero, and a slide
 * that leaves them blank renders no button at all — which is what the
 * field's own hint there ("Leave both blank for no button") has always
 * promised. This used to render a second, always-on button whose label
 * came from home.hero.ctaSecondary in messages/*.json, so the homepage
 * showed a button that appeared nowhere in the admin, and a slide with no
 * CTA configured still showed one. That mismatch is what this shape
 * fixes; a slide that wants to point at /contact says so in its own
 * Button link field. (The mockup has a second, ghost button; it is a
 * placeholder there and must not come back for the same reason.)
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
      <div className="absolute inset-0 bg-linear-to-t from-primary-900/95 via-primary-900/50 to-primary-900/30" />

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
              className="btn-outline border-white/50! text-white! hover:border-white! hover:bg-white/10!"
            >
              {ctaSecondaryLabel}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
