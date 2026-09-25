/**
 * lib/project-card-labels.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two label decisions components/FeaturedProjectCard.tsx cannot make
 * for itself, because it takes its strings already translated (see its own
 * header for why it stays free of next-intl).
 *
 * They live here rather than beside a caller because there are three: the
 * /projects listing, the home page's "Selected developments", and — since
 * Phase 2b-5.3 — a project card embedded in a news article. All three used
 * to carry their own copy; the listing and the home page were left alone
 * when this file appeared, because unifying them reached outside that
 * phase's scope, and they were folded in immediately afterwards.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { formatMonthYear } from "@/lib/format";
import type { ProjectSignal } from "@/lib/projects";

/** An upcoming development has nothing to walk through yet — see the note
 *  on the CTA in components/FeaturedProjectCard.tsx. */
export function projectCtaKey(status: string): "registerInterest" | "viewProject" {
  return status === "UPCOMING" ? "registerInterest" : "viewProject";
}

/** The derived "what happened here lately" line, or null when a project
 *  has nothing worth saying — which is most of them, on purpose. */
export function projectSignalLabel(
  signal: ProjectSignal | null,
  t: (key: never, values?: Record<string, unknown>) => string,
  locale: string,
): string | null {
  if (!signal) return null;

  if (signal.kind === "awards") {
    return t("signal.awards" as never, { count: signal.count, year: signal.year });
  }

  return t("signal.progressPhotos" as never, {
    count: signal.count,
    when: formatMonthYear(locale, signal.year, signal.month),
  });
}
