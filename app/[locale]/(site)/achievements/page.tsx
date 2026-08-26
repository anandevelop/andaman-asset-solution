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
 *    homepage or with an admin's edits in /admin/awards.
 *
 * Grouping: an award with projectName === null is a company-level award
 * ("Corporate Awards" on the old site); everything else is a project-level
 * award ("Property Awards" on the old site), grouped under that project's
 * name. Both the old site and getAwards() already order by sortOrder, so
 * groups are built with a plain reduce rather than a second sort.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { Trophy } from "lucide-react";
import Reveal from "@/components/Reveal";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import { getAwards, type Award } from "@/lib/awards";
import { getAchievementsContent } from "@/content/achievements";

export const revalidate = 3600;

type Props = { params: { locale: string } };

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "achievements" });

  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: {
      canonical: `${siteConfig.url}/${locale}/achievements`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/achievements`]),
      ),
    },
  };
}

function AwardCard({ award, index }: { award: Award; index: number }) {
  return (
    <Reveal delay={Math.min(index, 6) * 0.05}>
      <div className="relative flex h-full flex-col rounded-sm border border-primary/10 bg-white p-6 pt-16 shadow-card">
        <div className="absolute left-1/2 -top-10 h-20 w-20 -translate-x-1/2 sm:h-24 sm:w-24">
          {award.trophyImageUrl ? (
            <Image
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

export default async function AchievementsPage({ params: { locale } }: Props) {
  unstable_setRequestLocale(locale);

  const [t, awards] = await Promise.all([
    getTranslations("achievements"),
    getAwards(locale),
  ]);

  const content = getAchievementsContent(locale);

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

  return (
    <>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Reveal>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-light text-primary sm:text-5xl">
            {t("title")}
          </h1>
          <div className="horizon-divider my-6 ml-0" />
        </Reveal>
      </section>

      {/* ── Narrative (content/achievements.ts, real copy) ─────────────── */}
      <section className="container-luxe grid gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <h2 className="text-2xl font-light text-primary sm:text-3xl">
            {content.intro.heading}
          </h2>
          <p className="mt-4 max-w-lg whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
            {content.intro.body}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="text-2xl font-light text-primary sm:text-3xl">
            {content.evolution.heading}
          </h2>
          <p className="mt-4 max-w-lg whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
            {content.evolution.body}
          </p>
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
            <section className="container-luxe py-12 sm:py-16">
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
            </section>
          )}

          {/* ── Property Awards, grouped by project ─────────────────── */}
          {propertyAwardGroups.length > 0 && (
            <section className="container-luxe pb-24 pt-12 sm:pt-16">
              <Reveal>
                <h2 className="text-xl font-medium text-primary sm:text-2xl">
                  {t("propertyAwards")}
                </h2>
              </Reveal>

              <div className="mt-10 space-y-12">
                {propertyAwardGroups.map((group) => (
                  <div key={group.projectName}>
                    <Reveal>
                      <h3 className="text-base font-medium text-accent-700">
                        {group.projectName}
                      </h3>
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
