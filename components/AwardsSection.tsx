/**
 * components/AwardsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Awards" — corporate credibility strip on the home page only.
 * (app/[locale]/(site)/page.tsx, between Featured Projects and Why us.)
 *
 * Server component: fetches its own data (lib/awards.ts) rather than
 * taking it as a prop, matching SalesTeamSection's convention.
 *
 * Locale is read here via next-intl's getLocale() rather than useLocale().
 * useLocale() is a hook, and this component's body is async (it awaits its
 * own data fetch) — eslint-plugin-react-hooks flags any hook call inside an
 * async function regardless of component type. getLocale() is the async
 * equivalent designed for exactly this shape, folded into the same
 * Promise.all([...]) as getTranslations() below, same fix already applied
 * to SalesTeamSection.tsx. titleEn/Th are then picked with pickLocale, the
 * same bilingual-fallback helper every other content section uses.
 *
 * The "05 Awards / Year 2021" summary in the top-right corner is computed
 * from the same active list this section renders (count + max year), not
 * a separate query — so the two numbers can never drift from the cards
 * below them.
 *
 * Renders nothing when there are no active awards, matching
 * FaqAccordion/SalesTeamSection's convention.
 *
 * `award.title` arrives already locale-resolved from lib/awards.ts (via
 * getTranslation() against AwardTranslation, falling back to the
 * deprecated titleEn/titleTh pair) — this component no longer picks the
 * language itself, since a fixed th/en pickLocale() can't express zh/ru.
 *
 * Trophies float above each card rather than sitting in a boxed tile: no
 * background tile behind the image, positioned to overlap the card's own
 * top edge, with a drop-shadow standing in for the depth the old gray tile
 * used to provide. The first award gets a wider grid column, a bigger
 * trophy, and larger type — the one worth leading with should read as the
 * headline, not tie visually with the rest.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Trophy } from "lucide-react";
import Reveal from "@/components/Reveal";
import { getAwards } from "@/lib/awards";

export default async function AwardsSection() {
  const locale = await getLocale();
  const [t, awards] = await Promise.all([
    getTranslations("awards"),
    getAwards(locale),
  ]);

  if (awards.length === 0) return null;

  const awardsCount = awards.length;
  const latestYear = Math.max(...awards.map((award) => award.year));

  return (
    <section className="py-20 sm:py-28">
      <div className="container-luxe">
        <Reveal>
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-xl">
              <p className="eyebrow">{t("eyebrow")}</p>
              <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
                {t("title")}
              </h2>
              <div className="horizon-divider my-6 ml-0" />
              <p className="text-sm leading-relaxed text-ink/70 sm:text-base">
                {t("intro")}
              </p>
            </div>

            <div className="flex shrink-0 items-start gap-8 sm:gap-10">
              <div className="text-right">
                <p className="text-3xl font-light text-primary sm:text-4xl">
                  {String(awardsCount).padStart(2, "0")}
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink/50">
                  {t("awardsCountLabel")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-light text-primary sm:text-4xl">{latestYear}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink/50">
                  {t("yearLabel")}
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* -mx-5/px-5 exactly matches container-luxe's own mobile padding
            (px-5) so this row bleeds flush to the viewport edge without
            exceeding it — the previous -mx-6/px-6 was 4px wider than the
            container's padding on each side, which pushed the whole page
            past 100vw and made the entire homepage scroll horizontally on
            mobile.

            Horizontal scroll stays for mobile/tablet (fixed-width cards in
            a flex row), but from lg: up it switches to a grid with exactly
            `awards.length` equal-width columns — every award fits on one
            row within the container's own width by construction, so
            desktop never scrolls no matter how many awards are seeded. */}
        {/* pt-16 gives the floating trophies (see below) room to bleed
            above each card without being clipped — overflow-x-auto below
            forces the browser to compute overflow-y as auto too (CSS spec:
            one axis non-"visible" drags the other along), so without this
            padding the mobile scroll box would crop them at its own top
            edge even though the card itself has nothing clipping it. */}
        <div
          className="mt-12 -mx-5 flex gap-6 overflow-x-auto px-5 pb-4 pt-16 sm:mx-0 sm:px-0 sm:[scrollbar-width:thin] lg:grid lg:overflow-visible lg:pb-0"
          style={{
            // First column wider than the rest so award #1 — the one
            // worth leading with — reads as the headline, not a tie.
            gridTemplateColumns: awards.map((_, i) => (i === 0 ? "1.6fr" : "1fr")).join(" "),
          }}
        >
          {awards.map((award, index) => {
            const featured = index === 0;

            return (
              <Reveal
                key={award.id}
                delay={index * 0.06}
                className={`shrink-0 lg:w-full ${featured ? "w-72" : "w-64"}`}
              >
                <div
                  className={`relative flex h-full flex-col rounded-sm border bg-white p-6 shadow-card lg:w-full ${
                    featured
                      ? "border-accent-700/20 pt-20 shadow-lg"
                      : "border-primary/10 pt-16"
                  }`}
                >
                  {/* Floating trophy — no bounding box, no background tile.
                      Positioned to overlap the card's own top edge (rather
                      than sit inside it) with a soft drop shadow doing the
                      job the old gray tile used to: separating it from the
                      white card behind it. */}
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 ${
                      featured
                        ? "-top-14 h-28 w-28 sm:h-32 sm:w-32"
                        : "-top-10 h-20 w-20 sm:h-24 sm:w-24"
                    }`}
                  >
                    {award.trophyImageUrl ? (
                      <Image
                        src={award.trophyImageUrl}
                        alt=""
                        fill
                        sizes="128px"
                        className="object-contain drop-shadow-[0_14px_20px_rgba(8,53,81,0.2)]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-accent-50">
                        <Trophy
                          size={featured ? 40 : 32}
                          strokeWidth={1.5}
                          className="text-accent-700"
                          aria-hidden
                        />
                      </div>
                    )}
                  </div>

                  <p
                    className={`text-center font-medium uppercase tracking-wide text-accent-700 ${
                      featured ? "text-sm" : "text-xs"
                    }`}
                  >
                    {award.organization}
                  </p>
                  <p
                    className={`mt-2 text-center font-medium leading-snug text-primary ${
                      featured ? "text-lg" : "text-base"
                    }`}
                  >
                    {award.title}
                  </p>
                  {award.projectName && (
                    <p className="mt-1 text-center text-sm text-ink/60">{award.projectName}</p>
                  )}
                  <p className="mt-auto pt-4 text-center text-sm text-ink/50">{award.year}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
