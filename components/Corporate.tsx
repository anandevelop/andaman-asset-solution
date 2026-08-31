/**
 * components/Corporate.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Corporate" — what the business actually does, sitting between the
 * featured projects and the awards strip on the home page. Projects show
 * the work; this explains the company behind it; the awards then vouch
 * for both.
 *
 * Mirrored against CompanyIntro on purpose — image left, copy right,
 * where CompanyIntro is copy left, image right. Both sections are a
 * paragraph beside a photograph, and running them the same way round
 * would make the page look like it repeats itself.
 *
 * The four services are pulled out of the sentence and set as a row.
 * "acquisition, construction, design, property management" is the part of
 * this copy a skimming visitor is actually looking for, and it disappears
 * when it is buried mid-paragraph. A row of four labels, not another card
 * grid — "Why us" further down the page is already four cards, and a
 * second one this close would flatten both.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { getTranslations } from "next-intl/server";
import Reveal from "@/components/Reveal";

/*
  Served from public/corporate/, not from a project's gallery folder.

  The gallery directories are project photography, replaced wholesale
  whenever a new shoot is dropped in — twice in one afternoon during the
  work that added these sections, and both times it silently broke every
  path pointing into them. Company-level sections should not be able to
  break that way, so their images get a directory of their own.
*/
const SERVICES = ["acquisition", "construction", "design", "management"] as const;

/**
 * One photo per service, in the same order as SERVICES — was a single
 * photograph until the four service labels below got their own matching
 * image each, since a reader skimming "acquisition / construction /
 * design / management" had no visual for three of the four. Each key's
 * translation (home.corporate.imageAlts.<key>) supplies that tile's alt
 * text.
 */
const SERVICE_IMAGES: Record<(typeof SERVICES)[number], string> = {
  acquisition: "/corporate/living-aerial.webp",
  construction: "/corporate/development-exterior.webp",
  design: "/corporate/design-double-height.webp",
  management: "/corporate/pool-lap.webp",
};

export default async function Corporate() {
  const t = await getTranslations("home.corporate");

  return (
    <section className="container-luxe py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        {/* `order` rather than source order: the photographs are decorative
            and the heading is the section's subject, so the copy stays
            first in the DOM for screen readers and keyboard order, and
            only moves to the right visually from `lg` up. */}
        <Reveal className="lg:order-2">
          <h2 className="text-3xl font-light uppercase tracking-[0.07em] text-primary sm:text-4xl">
            {t("title")}
          </h2>

          <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("body")}
          </p>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 border-t border-primary/10 pt-6">
            {SERVICES.map((key) => (
              <li
                key={key}
                className="text-xs font-medium uppercase tracking-wide text-accent-700"
              >
                {t(`services.${key}` as never)}
              </li>
            ))}
          </ul>
        </Reveal>

        {/* One tile per service, same order as the label list above so the
            correspondence reads left-to-right, top-to-bottom without
            needing the caption — the caption on each tile is there for
            the case where a visitor's eye lands on the photos first. */}
        <Reveal delay={0.15} className="lg:order-1">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {SERVICES.map((key) => (
              <div
                key={key}
                className="group relative aspect-[4/3] w-full overflow-hidden rounded-sm shadow-card"
              >
                <ImageWithSkeleton
                  src={SERVICE_IMAGES[key]}
                  alt={t(`imageAlts.${key}` as never)}
                  fill
                  sizes="(max-width: 1024px) 45vw, 22vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary-900/70 via-primary-900/0 to-transparent" />
                <span className="absolute bottom-2.5 left-3 text-[10px] font-medium uppercase tracking-wide text-white sm:bottom-3 sm:left-3.5 sm:text-xs">
                  {t(`services.${key}` as never)}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
