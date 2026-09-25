import "server-only";

/**
 * lib/admin/project-readiness.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Is this project finished?" — the five things that are each edited on a
 * different tab of the project workspace, answered in one place.
 *
 * The workspace has seven tabs and nothing on any of them says whether the
 * others are done. A project could be published with a hero image, no unit
 * types, Russian copy nobody wrote and no progress logged this month, and
 * the only way to find that out was to open all seven and remember. Every
 * check here is a fact somebody has to go and fix on a named tab, so each
 * one carries the tab to fix it on.
 *
 * ONE QUERY, AND WHY IT HAS TO STAY ONE
 *
 * This renders in the Overview tab's sidebar, on a page that already runs
 * its own full project fetch. A readiness panel that cost five more round
 * trips would make the slowest screen in the back office slower to tell you
 * something you could already see by clicking around. So: one `findFirst`,
 * with the two relation counts as `_count` and this month's progress as a
 * `take: 1`, rather than separate counts per check.
 *
 * It deliberately does NOT reuse lib/admin/project-list.ts's enrichment,
 * which computes the same locale fills for every project on a page of 25 —
 * the shape that is right for a list is a different query from the one that
 * is right for a single record.
 *
 * WHAT "READY" MEANS HERE, AND WHAT IT DOES NOT
 *
 * Advice, not a gate. Nothing in this file is consulted by
 * lib/publishing-gate.ts and nothing refuses a publish because a check
 * fails — the gate is `contentStatus`, and conflating the two would mean a
 * missing Russian tagline could block a launch. See `isPublished` on the
 * result for what the panel shows alongside it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { locales } from "@/i18n";
import { localeFills, type LocaleFill } from "@/lib/locale-completeness";

/** Which workspace tab fixes a failing check. */
export type ReadinessTab = "overview" | "content" | "seo" | "units" | "progress";

export type ReadinessCheck = {
  /** i18n key suffix under admin.projects.readiness.check.* */
  key: "media" | "localeContent" | "unitTypes" | "seo" | "progress";
  ok: boolean;
  /** Where to go and fix it. */
  tab: ReadinessTab;
  /** Filled in when the check has a count worth showing ("2 of 4"). */
  done?: number;
  total?: number;
};

export type ProjectReadiness = {
  checks: ReadinessCheck[];
  /** How many passed, for the headline. */
  passed: number;
  /** Per-locale fill of the public copy, for the four small bars. */
  localeFills: { locale: string; fill: LocaleFill }[];
  isPublished: boolean;
};

const EMPTY: ProjectReadiness = {
  checks: [],
  passed: 0,
  localeFills: [],
  isPublished: false,
};

const filled = (value: string | null | undefined) => (value ?? "").trim().length > 0;

export async function getProjectReadiness(projectId: string): Promise<ProjectReadiness> {
  const now = new Date();

  const row = await safeQuery(
    "admin:projectReadiness",
    () =>
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: {
          isPublished: true,
          heroImageUrl: true,
          heroMediaType: true,
          heroVideoUrl: true,
          gallery: true,
          translations: {
            select: {
              locale: true,
              name: true,
              tagline: true,
              description: true,
              metaTitle: true,
              metaDescription: true,
            },
          },
          _count: { select: { unitTypes: true } },
          // This calendar month only: the question is "has anybody logged
          // this month yet", not "is there a log at all".
          progressUpdates: {
            where: { year: now.getFullYear(), month: now.getMonth() + 1 },
            select: { isPublished: true },
            take: 1,
          },
        },
      }),
    null,
  );

  if (!row) return EMPTY;

  /* A hero is an image *or* a video, decided by heroMediaType — checking
     heroImageUrl alone would report a video-led project as missing its
     hero. See the field comment on Project.heroMediaType. */
  const hasHero =
    row.heroMediaType === "VIDEO" ? filled(row.heroVideoUrl) : filled(row.heroImageUrl);

  const fills = localeFills(
    row.translations.map((entry) => ({
      locale: entry.locale,
      name: entry.name,
      tagline: entry.tagline,
      description: entry.description,
    })),
  );
  const completeLocales = fills.filter((entry) => entry.fill === "complete").length;

  /* SEO counts a locale only when both halves are written. A meta title
     with no description still truncates to the page's own first paragraph
     in a search result, which is the thing the SEO tab exists to stop. */
  const seoLocales = row.translations.filter(
    (entry) => filled(entry.metaTitle) && filled(entry.metaDescription),
  ).length;

  const checks: ReadinessCheck[] = [
    { key: "media", ok: hasHero && row.gallery.length > 0, tab: "overview" },
    {
      key: "localeContent",
      ok: completeLocales === locales.length,
      tab: "content",
      done: completeLocales,
      total: locales.length,
    },
    {
      key: "unitTypes",
      ok: row._count.unitTypes > 0,
      tab: "units",
      done: row._count.unitTypes,
    },
    {
      key: "seo",
      ok: seoLocales === locales.length,
      tab: "seo",
      done: seoLocales,
      total: locales.length,
    },
    { key: "progress", ok: row.progressUpdates.length > 0, tab: "progress" },
  ];

  return {
    checks,
    passed: checks.filter((check) => check.ok).length,
    localeFills: fills,
    isPublished: row.isPublished,
  };
}
