"use client";

/**
 * components/AwardsSpotlight.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The interactive half of the home page "Awards" section — a single award
 * lit up on a stage, auto-rotating through the list, with the list itself
 * doubling as the control for it. Split from AwardsSection.tsx because that
 * file is an async Server Component (it awaits its own data fetch), and a
 * "use client" directive can't live in the same file as one.
 *
 * State is a target/displayed pair rather than one index, so the list can
 * highlight the new row immediately (aria-pressed, the accent number, the
 * progress bar) while the stage itself still gets a beat to fade the old
 * trophy and caption out before swapping their content — matching the
 * mockup's own show(i): flip the row state now, swap the DOM content 380ms
 * later. `current` drives the list; `displayedIndex` drives the stage.
 *
 * Hovering a row selects it immediately (a mouse-driven preview, not
 * "motion"), which also — via the list's own onMouseEnter — stops the
 * auto-advance timer from being armed at all while the pointer stays
 * anywhere over the list. That's deliberately stricter than the reference
 * mockup's vanilla-JS version, whose per-row `mouseenter` handler calls the
 * same `show()` that arms a fresh 5.5s timer regardless of the list's own
 * "paused" state — so hovering a row there visually freezes the progress
 * bar but still silently auto-advances 5.5s later. The brief here says
 * hovering should stop the auto-advance outright, so the auto-advance
 * effect below checks `isHovering` itself rather than trusting the CSS
 * pause class to also mean the timer stopped.
 *
 * Sparks are generated once, client-side, in a useEffect — not during
 * render — so their random positions can't disagree between the server's
 * markup and the client's first paint.
 */

import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import Reveal from "@/components/Reveal";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";

export type SpotlightAward = {
  id: string;
  title: string;
  organization: string;
  projectName: string | null;
  year: number;
  trophyImageUrl: string | null;
};

type Labels = {
  eyebrow: string;
  title: string;
  intro: string;
  awardsCountLabel: string;
  yearLabel: string;
};

type Props = {
  awards: SpotlightAward[];
  awardsCount: number;
  latestYear: number;
  labels: Labels;
};

const AUTO_ADVANCE_MS = 5500;
const RESUME_AFTER_HOVER_MS = 2500;
const TRANSITION_MS = 380;
const SPARK_COUNT = 16;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/** Counts up from `from` to `target` over 1.4s (ease-out cubic) once
 *  `active` turns true, and only once — matching the mockup's countUp. */
function useCountUp(target: number, from: number, pad: number, active: boolean, reducedMotion: boolean) {
  const [display, setDisplay] = useState(from);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;

    if (reducedMotion) {
      setDisplay(target);
      return;
    }

    let frame: number;
    const start = performance.now();
    const duration = 1400;

    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (k < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reducedMotion, target, from]);

  return String(display).padStart(pad, "0");
}

type Spark = { left: number; duration: number; delay: number };

export default function AwardsSpotlight({ awards, awardsCount, latestYear, labels }: Props) {
  const reducedMotion = usePrefersReducedMotion();

  const [current, setCurrent] = useState(0);
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [statsActive, setStatsActive] = useState(false);
  const [sparks, setSparks] = useState<Spark[]>([]);

  const hasMountedRef = useRef(false);
  const resumeDelayRef = useRef(AUTO_ADVANCE_MS);

  const awardsCountDisplay = useCountUp(awardsCount, 0, 2, statsActive, reducedMotion);
  const yearDisplay = useCountUp(latestYear, latestYear - 31, 0, statsActive, reducedMotion);

  // Stage transition: flip the visible content 380ms after `current`
  // changes (0ms under reduced motion), giving the outgoing trophy/caption
  // a beat to fade out first. Skipped on mount — there's nothing to fade
  // out from yet.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setIsLeaving(true);
    const delay = reducedMotion ? 0 : TRANSITION_MS;
    const timer = setTimeout(() => {
      setDisplayedIndex(current);
      setIsLeaving(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [current, reducedMotion]);

  // Auto-advance: rearms on every selection change, but not while the
  // pointer is over the list or the visitor prefers reduced motion. The
  // first arm after a hover ends uses the shorter resume delay; every
  // other arm uses the standard cadence.
  useEffect(() => {
    if (reducedMotion || isHovering) return;
    const delay = resumeDelayRef.current;
    resumeDelayRef.current = AUTO_ADVANCE_MS;
    const timer = setTimeout(() => setCurrent((c) => (c + 1) % awards.length), delay);
    return () => clearTimeout(timer);
  }, [current, isHovering, reducedMotion, awards.length]);

  // Sparks: random per mount, client-only (see file header).
  useEffect(() => {
    if (reducedMotion) {
      setSparks([]);
      return;
    }
    setSparks(
      Array.from({ length: SPARK_COUNT }, () => ({
        left: 50 + (Math.random() - 0.5) * 44,
        duration: 5 + Math.random() * 5,
        delay: -Math.random() * 8,
      })),
    );
  }, [reducedMotion]);

  function selectAward(index: number) {
    setCurrent(index);
  }

  function handleListMouseEnter() {
    setIsHovering(true);
  }

  function handleListMouseLeave() {
    resumeDelayRef.current = RESUME_AFTER_HOVER_MS;
    setIsHovering(false);
  }

  const shown = awards[displayedIndex];

  return (
    <section className="spotlight-section relative overflow-hidden py-20 sm:py-24">
      <div className="container-luxe">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-[72px]">
          <div>
            <Reveal>
              <p className="text-[10px] font-normal uppercase tracking-[0.32em] text-accent">
                {labels.eyebrow}
              </p>
              <h2 className="mt-2.5 text-[32px] leading-tight font-light text-white">{labels.title}</h2>
              <p className="mt-[18px] max-w-[460px] text-[13px] leading-[1.75] font-light text-white/60">
                {labels.intro}
              </p>
            </Reveal>

            <Reveal delay={0.15} onEnter={() => setStatsActive(true)} className="mt-10 flex gap-11">
              <div>
                <p className="text-[40px] leading-none font-extralight tabular-nums text-white">
                  {awardsCountDisplay}
                </p>
                <p className="mt-2 text-[9px] tracking-[0.28em] text-white/50 uppercase">
                  {labels.awardsCountLabel}
                </p>
              </div>
              <div>
                <p className="text-[40px] leading-none font-extralight tabular-nums text-white">{yearDisplay}</p>
                <p className="mt-2 text-[9px] tracking-[0.28em] text-white/50 uppercase">{labels.yearLabel}</p>
              </div>
            </Reveal>

            <Reveal delay={0.25}>
              <ol
                role="list"
                className={`mt-11 list-none border-t border-white/10 p-0 ${
                  isHovering ? "spotlight-list-paused" : ""
                }`}
                onMouseEnter={handleListMouseEnter}
                onMouseLeave={handleListMouseLeave}
              >
                {awards.map((award, index) => {
                  const active = index === current;

                  return (
                    <li key={award.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectAward(index)}
                        onMouseEnter={() => selectAward(index)}
                        className={`relative grid w-full grid-cols-[34px_1fr_auto] items-baseline gap-3.5 border-b
                            border-white/10 px-3 py-4 text-left transition-colors duration-300 ${
                              active ? "spotlight-row-active bg-white/[0.055]" : "hover:bg-white/[0.035]"
                            }`}
                      >
                        <span
                          className={`text-[10px] tracking-[0.2em] transition-colors duration-300 ${
                            active ? "text-accent" : "text-white/35"
                          }`}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>
                          <span
                            className={`block text-sm leading-snug font-light transition-colors duration-300 ${
                              active ? "text-white" : "text-white/70"
                            }`}
                          >
                            {award.title}
                          </span>
                          {award.projectName && (
                            <span className="mt-0.5 block text-[10px] tracking-[0.14em] text-white/40 uppercase">
                              {award.projectName}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] font-light text-white/40">{award.year}</span>
                        <span
                          aria-hidden
                          className="spotlight-bar pointer-events-none absolute bottom-[-1px] left-0 h-px w-0"
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Reveal>
          </div>

          <Reveal delay={0.1} className="relative order-first h-[500px] lg:order-2 lg:h-[620px]">
            <div aria-live="polite" className="relative flex h-full items-center justify-center">
              <div
                aria-hidden
                className="spotlight-cone pointer-events-none absolute top-[-20px] left-1/2 h-[520px] w-[520px] -translate-x-1/2"
              />
              <div
                aria-hidden
                className="spotlight-pool pointer-events-none absolute bottom-[108px] left-1/2 h-16 w-[400px] -translate-x-1/2 rounded-full"
              />
              <div
                aria-hidden
                className="spotlight-podium pointer-events-none absolute bottom-[130px] left-1/2 h-9 w-[300px] -translate-x-1/2 rounded-full"
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                {sparks.map((spark, index) => (
                  <span
                    key={index}
                    className="spotlight-spark absolute bottom-[160px] h-[3px] w-[3px] rounded-full"
                    style={{
                      left: `${spark.left}%`,
                      animationDuration: `${spark.duration}s`,
                      animationDelay: `${spark.delay}s`,
                    }}
                  />
                ))}
              </div>

              <div className="spotlight-trophy-float relative -mt-[60px] flex h-[300px] w-[300px] items-end justify-center lg:h-[400px] lg:w-[400px]">
                <div className={`spotlight-fade relative h-full w-full ${isLeaving ? "spotlight-leaving" : ""}`}>
                  {shown.trophyImageUrl ? (
                    <ImageWithSkeleton
                      src={shown.trophyImageUrl}
                      alt={`${shown.organization} trophy: ${shown.title}`}
                      fill
                      sizes="400px"
                      className="object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.45)]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Trophy size={96} strokeWidth={1} className="text-accent" aria-hidden />
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`spotlight-caption absolute inset-x-0 bottom-6 text-center ${
                  isLeaving ? "spotlight-leaving" : ""
                }`}
              >
                <p className="text-[10px] tracking-[0.3em] text-accent uppercase">{shown.organization}</p>
                <p className="mt-2.5 text-xl leading-snug font-light text-white">{shown.title}</p>
                <p className="mt-1.5 text-xs font-light text-white/55">
                  {shown.projectName ? `${shown.projectName} · ${shown.year}` : shown.year}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
