/**
 * lib/mission-principles.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The About page's 3-card "how we work" section (previously the PRINCIPLES
 * constant in app/[locale]/(site)/about/page.tsx). Structurally identical
 * to lib/home-content.ts's getWhyUsPoints() — both are icon + translated
 * title + translated body — but kept in its own file/model since it
 * belongs to a different page, the same way lib/awards.ts and
 * lib/milestones.ts stay separate despite a similar read shape.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getTranslation } from "@/lib/get-translation";
import type { SectionIcon } from "@prisma/client";

export type MissionPrinciple = {
  id: string;
  icon: SectionIcon;
  title: string;
  body: string;
};

const SELECT = {
  id: true,
  icon: true,
  translations: true,
} as const;

type Row = {
  id: string;
  icon: SectionIcon;
  translations: { locale: string; title: string; body: string }[];
};

/** Active principles, curated order — drives the About page's 3 cards. */
export async function getMissionPrinciples(locale: string): Promise<MissionPrinciple[]> {
  const rows: Row[] = await safeQuery(
    "missionPrinciple.findMany(active)",
    () =>
      prisma.missionPrinciple.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: SELECT,
      }),
    [] as Row[],
  );

  return rows.map((row) => {
    // getTranslation() already falls back to "en" then "th" — no
    // deprecated column pair here, this model was born after the
    // 4-locale pattern, same as HeroStorySlide.
    const t = getTranslation(row.translations, locale);

    return {
      id: row.id,
      icon: row.icon,
      title: t?.title ?? "",
      body: t?.body ?? "",
    };
  });
}
