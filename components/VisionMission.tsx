/**
 * components/VisionMission.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Vision & Mission" — the dark corporate block on the home page, directly
 * below CompanyIntro.
 *
 * One of only two dark sections on the page (the other is the closing
 * CTA), which is what makes it read as a deliberate pause rather than
 * another content row. It uses the CI navy (bg-primary, #083551) instead
 * of the near-black in the source deck so it matches the closing CTA and
 * the rest of the palette.
 *
 * v3 of the right-hand visual. v1 was four numbers as discs; v2 was an
 * eight-photo 4×4 bento grid (components/VisionMissionMosaic.tsx, still on
 * disk but unused as of this pass) — dense, but flat: eight equally-sized
 * tiles read as a wall of thumbnails rather than a composed photograph,
 * and the brief asked for the opposite of "more photos," not more of
 * them arranged differently. This pass is a single photograph with a thin
 * accent-colored outline peeking out from behind its top-right corner —
 * the depth comes from that offset frame (plus the shadow) rather than
 * from a second overlapping photo, which read as a stray extra tile
 * rather than part of the composition.
 *
 * Two more small "lo-fi" touches carry the rest of the "has some
 * dimension to it" brief without adding more photography: a soft blurred
 * accent-colored glow in the upper-right corner (the section's only truly
 * decorative shape, nothing else on the page has one), and an oversized,
 * barely-there quotation mark behind the Vision/Mission copy — these are
 * quotations from the source deck, so the mark is literal, not just
 * decoration for its own sake.
 *
 * The values stay hard-coded here rather than in messages/*.json: "300+"
 * is the same glyph sequence in all four locales, so putting it in four
 * translation files would be four copies of one number to keep in sync.
 * Only the labels are translated.
 *
 * ⚠ These four figures are marketing claims supplied by the company, not
 * values derived from the database. The awards counter in particular is
 * independent of AwardsSection/lib/awards.ts, which renders the awards
 * actually recorded — if the recorded list and this number disagree, a
 * visitor sees both on this same page. Keep them reconciled by hand, or
 * wire this to the real counts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { getTranslations } from "next-intl/server";
import Reveal from "@/components/Reveal";

/*
  Backdrop photograph plus a navy scrim over it.

  The photo alone does not work here. Screenshotting this section showed
  that pool-lap.webp is a very bright frame, so even at 12% opacity it
  lifted the background from #083551 to roughly #2a526b — the CI navy was
  gone, the block read as a washed mid-blue, and because a photo is not a
  flat colour the contrast ratio for the text varied across the section
  instead of being one known number.

  The scrim fixes both: solid navy on the left where the copy sits,
  easing to 80% on the right where the photo sits. Measured on the
  rendered page, the background stays within a couple of points of
  #083551 behind the text and never gets lighter than #204862 anywhere —
  which keeps the accent numerals at 5.2:1 and the white/75 body copy at
  6.3:1 in the worst spot, both clear of the 4.5:1 AA floor.
*/
const BACKDROP = "/corporate/pool-lap.webp";

/**
 * value: locale-neutral, so it stays here rather than in four message
 * files. labelKey: resolved from home.visionMission.stats.
 */
const STATS = [
  { labelKey: "team", value: "300+" },
  { labelKey: "feedback", value: "1,000+" },
  { labelKey: "awards", value: "10+" },
  { labelKey: "projects", value: "30+" },
] as const;

/**
 * Not reused from CompanyIntro's five directly above this section
 * (exterior-facade, victory/cover, pool-terrace, trinity-village/cover,
 * the-victory30) — adjacent sections sharing a photo reads as a rendering
 * bug rather than a motif. Also distinct from Corporate's four service
 * photos further down the page.
 */
const HERO_PHOTO = "/gallery/residence-prime/exterior-street.webp";

export default async function VisionMission() {
  const t = await getTranslations("home.visionMission");
  const shared = await getTranslations("common");

  const heroAlt = shared("projectPhotoAlt", {
    project: shared("projectNames.residencePrime"),
  });

  return (
    <section className="relative isolate overflow-hidden bg-primary py-20 text-white sm:py-28">
      <ImageWithSkeleton
        src={BACKDROP}
        alt=""
        aria-hidden
        fill
        sizes="100vw"
        className="-z-20 object-cover opacity-25"
        skeletonClassName="-z-20"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-primary via-primary/95 to-primary/80"
      />

      {/* The section's one purely decorative shape — a soft glow, not a
          photo, so it reads as atmosphere rather than another thing to
          look at. Blurred well past its own box so it never shows a hard
          edge against the navy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-accent/20 blur-[100px] sm:-right-32 sm:-top-32 sm:h-96 sm:w-96"
      />

      <div className="container-luxe">
        <Reveal>
          {/* text-white overrides the global h1–h4 { @apply text-primary }
              rule in app/globals.css, which would otherwise render this
              navy-on-navy. */}
          <h2 className="text-3xl font-light uppercase tracking-[0.07em] text-white sm:text-4xl">
            {t("title")}
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-20 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-center lg:gap-16">
          {/* ── Vision / Mission, then the counters ─────────────────
              `order` rather than source order: the photo stack is
              decorative and the copy is the section's subject, so the
              copy stays first in the DOM for screen readers and keyboard
              order, and only moves to the right visually from `lg` up —
              same technique as components/Corporate.tsx. */}
          <div className="lg:order-2">
            {/* The oversized quotation mark sits behind both blocks, not
                repeated per-quote — one mark framing the pair reads as a
                single idea ("here is what we believe"); one behind each
                would read as a template stamped twice. */}
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute -left-1 -top-12 select-none text-[8rem] font-light leading-none text-white/[0.07] sm:-top-16 sm:text-[10rem]"
              >
                &rdquo;
              </span>

              <div className="relative space-y-10">
                {(
                  [
                    { label: t("visionLabel"), body: t("vision") },
                    { label: t("missionLabel"), body: t("mission") },
                  ] as const
                ).map(({ label, body }, index) => (
                  <Reveal key={label} delay={index * 0.1}>
                    <h3 className="text-lg font-light text-white sm:text-xl">{label}</h3>
                    {/* A quotation in the source deck, and still a quotation
                        here — blockquote rather than <p> so it is announced
                        as one. The border echoes .prose-article blockquote. */}
                    <blockquote className="mt-4 border-l-2 border-accent/60 pl-6 text-sm leading-relaxed text-white/75 sm:text-base">
                      {body}
                    </blockquote>
                  </Reveal>
                ))}
              </div>
            </div>

            <Reveal delay={0.2}>
              <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-10 sm:grid-cols-4 sm:gap-x-4 sm:divide-x sm:divide-white/10">
                {STATS.map((stat) => (
                  <div key={stat.labelKey} className="sm:pl-4 sm:first:pl-0">
                    <dt className="sr-only">{t(`stats.${stat.labelKey}` as never)}</dt>
                    <dd>
                      {/* A short accent tick standing in for the disc
                          shape the counters used to sit inside — enough
                          of a mark to keep each number from just floating
                          in space, without bringing the circle back. */}
                      <span aria-hidden className="mb-2 block h-px w-6 bg-accent/70" />
                      <span className="block text-2xl font-light text-accent sm:text-3xl">
                        {stat.value}
                      </span>
                      <span
                        aria-hidden
                        className="mt-1 block text-xs leading-snug text-white/60 sm:text-sm"
                      >
                        {t(`stats.${stat.labelKey}` as never)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* ── The photo ──────────────────────────────────────────
              An outline frame peeks out from behind the top-right
              corner — one photograph plus that offset line is enough
              depth on its own, without a second overlapping tile. */}
          <Reveal delay={0.15} className="lg:order-1">
            <div className="relative mx-auto w-full max-w-xs sm:max-w-sm lg:mx-0 lg:max-w-none">
              <div
                aria-hidden
                className="absolute -right-4 -top-5 z-0 h-[85%] w-[85%] rounded-sm border border-accent/40 sm:-right-6 sm:-top-6"
              />

              <div className="relative z-10 aspect-[4/5] w-full overflow-hidden rounded-sm shadow-2xl">
                <ImageWithSkeleton
                  src={HERO_PHOTO}
                  alt={heroAlt}
                  fill
                  sizes="(max-width: 1024px) 70vw, 26rem"
                  className="object-cover"
                />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
