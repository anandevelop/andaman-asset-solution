/**
 * components/VisionMission.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Vision & Mission" — the dark block on the home page, below CompanyIntro.
 *
 * Full-bleed navy, like AwardsSection further down the page — an inset
 * card was tried first, but on a wide viewport a boxed panel with the
 * page's own light background showing around it read as unfinished rather
 * than as a deliberate pause. It is one of the dark blocks on the page
 * (AwardsSection and the closing CTA are the others), which is what makes
 * it a pause from the surrounding light sections rather than a repeat.
 *
 * WHAT CAME OUT OF THIS SECTION, AND WHY
 *
 * A backdrop photograph, a blurred accent glow, an oversized quotation
 * mark and a framed hero photo — four decorative devices around two
 * paragraphs and four numbers. The copy and the figures are the section;
 * everything else was competing with them. The photography that went is
 * not missed: CompanyIntro directly above it is a gallery, and Corporate
 * below it is four photographs.
 *
 * THE FIGURES ARE COUNTED NOW
 *
 * This file used to carry a warning: the four numbers were free text an
 * admin typed, and the awards figure was independent of the awards
 * actually recorded, so "10+" here could sit on the same page as six
 * listed awards. Three of the four are now counted from the content they
 * name (lib/company-stats.ts) and the fourth — the founding year — is a
 * stored company fact that renders nothing until somebody sets it. The
 * note under the grid says which is which, because a panel of numbers with
 * no provenance is a panel nobody can check.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Reveal from "@/components/Reveal";
import { getCompanyStats } from "@/lib/company-stats";

export default async function VisionMission() {
  const [t, stats] = await Promise.all([
    getTranslations("home.visionMission"),
    getCompanyStats(),
  ]);

  /*
    Only the figures that have something behind them. A zero is a real
    answer for "villas under construction" and is shown; a missing founding
    year is not an answer at all, and its tile is left out rather than
    filled with a guess.
  */
  const tiles = [
    stats.foundedYear === null
      ? null
      : { key: "established", value: String(stats.foundedYear) },
    { key: "projectsComplete", value: String(stats.projectsDelivered) },
    { key: "awards", value: String(stats.awards) },
    { key: "villasInBuild", value: String(stats.villasUnderConstruction) },
  ].filter((tile): tile is { key: string; value: string } => tile !== null);

  return (
    <section className="bg-surface-raised py-16 text-ink sm:py-20">
      <div className="container-luxe">
        <Reveal>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            {/* ── Vision and mission ──────────────────────────────── */}
            <div>
              {/* text-white overrides the global h1–h4 { @apply
                  text-primary } rule in app/globals.css, which would
                  otherwise render this navy-on-navy. */}
              <h2 className="text-3xl font-light text-ink sm:text-4xl">{t("title")}</h2>

              <div className="mt-9 space-y-9">
                {(
                  [
                    { label: t("visionLabel"), body: t("vision") },
                    { label: t("missionLabel"), body: t("mission") },
                  ] as const
                ).map(({ label, body }) => (
                  <div key={label}>
                    <h3 className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-ink">
                      <span aria-hidden className="h-px w-8 bg-gold" />
                      {label}
                    </h3>
                    {/* A quotation in the source deck and still one here,
                        so it is marked up as one and announced as one. */}
                    <blockquote className="mt-3 text-sm leading-relaxed text-ink/85 sm:text-base">
                      {body}
                    </blockquote>
                  </div>
                ))}
              </div>
            </div>

            {/* ── The figures ─────────────────────────────────────── */}
            <div>
              {/* Four frosted cards with air between them, the same glass
                  as the site's buttons, over the section's faint gold
                  wash. Each carries a short gold rule, like the labels on
                  the left. */}
              <dl className="grid grid-cols-2 gap-3 sm:gap-4">
                {tiles.map((tile, index) => (
                  <div
                    key={tile.key}
                    className={[
                      "rounded-2xl border border-white/70 bg-white/55 px-6 py-7 backdrop-blur-xl backdrop-saturate-150 sm:px-8 sm:py-9",
                      "shadow-[0_0_0_1px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.95),0_18px_40px_-22px_rgba(0,0,0,0.3)]",
                      /* An odd number of figures — which is what happens
                         until somebody fills in the founding year — would
                         otherwise leave a phantom half-cell of the
                         container's own hairline colour in the corner,
                         reading as a tile that failed to load. The last
                         one takes the whole row instead. (The tiles are
                         separate cards now, but a lone half-width card
                         looks just as unfinished.) */
                      tiles.length % 2 === 1 && index === tiles.length - 1 ? "col-span-2" : "",
                    ].join(" ")}
                  >
                    {/* The gold rule is a pseudo-element: a <dl> group may
                        only hold dt and dd. */}
                    <dd className="text-4xl font-light leading-none text-ink before:mb-5 before:block before:h-[3px] before:w-8 before:rounded-full before:bg-gold before:content-[''] sm:text-5xl">
                      {tile.value}
                    </dd>
                    <dt className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
                      {t(`stats.${tile.key}` as never)}
                    </dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
