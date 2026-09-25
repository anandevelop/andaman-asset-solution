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
 * to SalesTeamSection.tsx.
 *
 * The "05 / 2021" summary is computed from the same active list this
 * section renders (count + max year), not a separate query — so the two
 * numbers can never drift from the list below them.
 *
 * Renders nothing when there are no active awards, matching
 * FaqAccordion/SalesTeamSection's convention.
 *
 * `award.title` arrives already locale-resolved from lib/awards.ts (via
 * getTranslation() against AwardTranslation, falling back to the
 * deprecated titleEn/titleTh pair) — this component no longer picks the
 * language itself, since a fixed th/en pickLocale() can't express zh/ru.
 *
 * Everything past the data fetch — the spotlight stage, the auto-rotating
 * list, the count-up numbers — lives in components/AwardsSpotlight.tsx, a
 * Client Component. Split out because this file is an async Server
 * Component (it awaits its own data fetch) and a "use client" directive
 * can't live in the same file as one; this file's only job is fetching and
 * handing down plain, serializable props.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getLocale, getTranslations } from "next-intl/server";
import AwardsSpotlight from "@/components/AwardsSpotlight";
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
    <AwardsSpotlight
      awards={awards}
      awardsCount={awardsCount}
      latestYear={latestYear}
      labels={{
        eyebrow: t("eyebrow"),
        title: t("title"),
        intro: t("intro"),
        awardsCountLabel: t("awardsCountLabel"),
        yearLabel: t("yearLabel"),
      }}
    />
  );
}
