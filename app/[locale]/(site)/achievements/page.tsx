/**
 * app/[locale]/(site)/achievements/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Our Achievements" — awards and industry recognition, linked from the
 * About page's Milestones section (app/[locale]/(site)/about/page.tsx).
 *
 * Content sources, deliberately kept separate:
 *  - The two narrative paragraphs ("Grow Together" and "...proof of our
 *    company's evolution and progress") are real copy transcribed from the
 *    old site and translated into all 4 locales — content/achievements.ts.
 *    Only structural labels (eyebrow, section headers) come from
 *    messages/*.json (`achievements` namespace).
 *  - The award lists themselves are NOT static content. They come from the
 *    same getAwards(locale) query the homepage AwardsSection uses
 *    (lib/awards.ts), so this page can never drift out of sync with the
 *    homepage or with an admin's edits in /admin/pages/about/awards.
 *
 * Grouping: an award with projectName === null is a company-level award
 * ("Corporate Awards" on the old site); everything else is a project-level
 * award ("Property Awards" on the old site), grouped under that project's
 * name. Both the old site and getAwards() already order by sortOrder, so
 * groups are built with a plain reduce rather than a second sort.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Trophy } from "lucide-react";
import Reveal from "@/components/Reveal";
import StatBar from "@/components/StatBar";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import { isDatabaseOffline } from "@/lib/db";
import { locales } from "@/i18n";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getAwards, type Award } from "@/lib/awards";
import { getAchievementsContent } from "@/content/achievements";

// Real development photography (public/gallery/**), not stock imagery —
// same photo sets the project pages themselves use. Only 3 of the 5
// projects (residence-prime, trinity-village, victory) have a photographed
// gallery; victory/cover.webp doubles as this page's banner because
// The Victory is one of the two named winners in the narrative copy below.
// Project names are proper nouns, same convention as content/company-timeline.ts
// — not run through i18n.
const HERO_IMAGE = "/gallery/victory/cover.webp";
const HERO_CAPTION = "The Victory — Cherngtalay, Phuket";
const NARRATIVE_IMAGE_1 = "/gallery/residence-prime/living-double-height.webp";
const NARRATIVE_IMAGE_2 = "/gallery/victory/the-victory3.webp";

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const t = await getTranslations({ locale, namespace: "achievements" });

  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: localizedAlternates(locale, "/achievements"),
  };
}

function AwardCard({ award, index }: { award: Award; index: number }) {
  return (
    <Reveal delay={Math.min(index, 6) * 0.05}>
      <div className="group relative flex h-full flex-col rounded-xs border border-primary/10 bg-white p-6 pt-16 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-cardHover">
        <div className="absolute left-1/2 -top-10 h-20 w-20 -translate-x-1/2 sm:h-24 sm:w-24">
          {award.trophyImageUrl ? (
            <ImageWithSkeleton
              src={award.trophyImageUrl}
              alt=""
              fill
              sizes="96px"
              className="object-contain drop-shadow-[0_14px_20px_rgba(8,53,81,0.2)]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-accent-50">
              <Trophy size={32} strokeWidth={1.5} className="text-accent-700" aria-hidden />
            </div>
          )}
        </div>

        <p className="text-center text-[10px] font-medium uppercase tracking-wide text-accent-700">
          {award.organization}
        </p>
        <p className="mt-1.5 text-center text-sm font-medium leading-snug text-primary">
          {award.title}
        </p>
        <p className="mt-auto pt-3 text-center text-xs text-ink/50">{award.year}</p>
      </div>
    </Reveal>
  );
}

export default async function AchievementsPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const [t, tAwards, tNav, awards] = await Promise.all([
    getTranslations("achievements"),
    getTranslations("awards"),
    getTranslations("nav"),
    getAwards(locale),
  ]);

  const content = getAchievementsContent(locale);

  const awardsCount = awards.length;
  const latestYear = awards.length > 0 ? Math.max(...awards.map((a) => a.year)) : null;

  const corporateAwards = awards.filter((award) => !award.projectName);

  const propertyAwardGroups: { projectName: string; awards: Award[] }[] = [];
  for (const award of awards) {
    if (!award.projectName) continue;
    const group = propertyAwardGroups.find((g) => g.projectName === award.projectName);
    if (group) {
      group.awards.push(award);
    } else {
      propertyAwardGroups.push({ projectName: award.projectName, awards: [award] });
    }
  }

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("achievements"), path: "/achievements" },
  ]);

  return (
    <>
      <JsonLd id="breadcrumb-schema" data={breadcrumbList(trail)} />
      {/* ── Header ───────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Reveal>
          <Breadcrumb items={trail} className="mb-5" />

          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-light text-primary sm:text-5xl">
            {t("title")}
          </h1>
        </Reveal>

        {/* Development-only, like every other page that reads the database:
            getAwards() degrades to an empty list, and a page about awards
            with no awards on it needs to say why. */}
        {isDatabaseOffline() && <DbOfflineNotice />}
      </section>

      {/* ── Hero photo ───────────────────────────────────────────────────
          Real site photography (see HERO_IMAGE comment above), not a
          generic stock banner — gives the page a visual opener instead of
          jumping straight into paragraphs. The stat bar below overlaps its
          bottom edge (same trick as the project pages' Hero + StatBar),
          reusing awardsCountLabel/yearLabel from the `awards` namespace so
          this page reads as one voice with the homepage's Awards section
          rather than inventing parallel copy. Skipped entirely once there
          are no awards to count. */}
      {awardsCount > 0 && (
        <>
          <section className="container-luxe pb-4">
            <Reveal>
              <div className="relative aspect-video w-full overflow-hidden rounded-xs shadow-card sm:aspect-21/8">
                <ImageWithSkeleton
                  src={HERO_IMAGE}
                  alt={HERO_CAPTION}
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-linear-to-t from-primary-900/75 via-primary-900/10 to-transparent" />
                <p className="absolute bottom-4 left-4 text-xs text-white/85 sm:bottom-6 sm:left-6 sm:text-sm">
                  {HERO_CAPTION}
                </p>
              </div>
            </Reveal>
          </section>

          <section className="container-luxe relative z-10 -mt-10 sm:-mt-14">
            <Reveal delay={0.1}>
              <StatBar
                tone="elevated"
                stats={[
                  { label: tAwards("awardsCountLabel"), value: String(awardsCount).padStart(2, "0") },
                  { label: tAwards("yearLabel"), value: String(latestYear) },
                ]}
              />
            </Reveal>
          </section>
        </>
      )}

      {/* ── Narrative (content/achievements.ts, real copy) ───────────────
          Alternating image/text, same pattern as the About page's Story
          section — a photo on one side keeps two long paragraphs from
          reading as a wall of text. Images swap sides between the two
          blocks so the page doesn't repeat the same layout twice in a row. */}
      <section className="container-luxe grid gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <div className="relative aspect-4/5 w-full overflow-hidden rounded-xs shadow-card">
            <ImageWithSkeleton
              src={NARRATIVE_IMAGE_1}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="flex h-full flex-col justify-center">
            <h2 className="text-2xl font-light text-primary sm:text-3xl">
              {content.intro.heading}
            </h2>
            <p className="mt-6 max-w-lg whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
              {content.intro.body}
            </p>
          </div>
        </Reveal>
      </section>

      <section className="container-luxe grid gap-10 pb-16 sm:pb-24 lg:grid-cols-2 lg:gap-16">
        <Reveal className="lg:order-2">
          <div className="relative aspect-4/5 w-full overflow-hidden rounded-xs shadow-card">
            <ImageWithSkeleton
              src={NARRATIVE_IMAGE_2}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>
        <Reveal delay={0.15} className="lg:order-1">
          <div className="flex h-full flex-col justify-center">
            <h2 className="text-2xl font-light text-primary sm:text-3xl">
              {content.evolution.heading}
            </h2>
            <p className="mt-6 max-w-lg whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
              {content.evolution.body}
            </p>
          </div>
        </Reveal>
      </section>

      {awards.length === 0 ? (
        <section className="container-luxe pb-24">
          <Reveal>
            <p className="text-sm text-ink/60">{t("empty")}</p>
          </Reveal>
        </section>
      ) : (
        <>
          {/* ── Corporate Awards ─────────────────────────────────────── */}
          {corporateAwards.length > 0 && (
            <section className="bg-primary-900/3 py-20 sm:py-28">
              <div className="container-luxe">
                <Reveal>
                  <h2 className="text-xl font-medium text-primary sm:text-2xl">
                    {t("corporateAwards")}
                  </h2>
                </Reveal>
                <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-14 sm:grid-cols-3 lg:grid-cols-4">
                  {corporateAwards.map((award, index) => (
                    <AwardCard key={award.id} award={award} index={index} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Property Awards, grouped by project ─────────────────── */}
          {propertyAwardGroups.length > 0 && (
            <section className="container-luxe pb-24 pt-20 sm:pt-28">
              <Reveal>
                <h2 className="text-xl font-medium text-primary sm:text-2xl">
                  {t("propertyAwards")}
                </h2>
              </Reveal>

              <div className="mt-10 space-y-16">
                {propertyAwardGroups.map((group) => (
                  <div key={group.projectName}>
                    <Reveal>
                      <div className="flex items-baseline gap-3 border-b border-primary/10 pb-3">
                        <h3 className="text-base font-medium text-accent-700">
                          {group.projectName}
                        </h3>
                        <span className="text-xs text-ink/40">
                          {t("awardsCount", { count: group.awards.length })}
                        </span>
                      </div>
                    </Reveal>
                    <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-14 sm:grid-cols-3 lg:grid-cols-4">
                      {group.awards.map((award, index) => (
                        <AwardCard key={award.id} award={award} index={index} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
