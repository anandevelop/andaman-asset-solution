/**
 * lib/project-card-labels.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two label decisions components/FeaturedProjectCard.tsx cannot make
 * for itself, because it takes its strings already translated (see its own
 * header for why it stays free of next-intl).
 *
 * They live here rather than beside a caller because there is now a third
 * one: the /projects listing, the home page's "Selected developments", and
 * — since Phase 2b-5.3 — a project card embedded in a news article. The
 * listing and the home page still carry their own identical copies of both
 * functions; unifying them touches pages outside that phase's scope, so it
 * is deliberately left as a follow-up rather than folded in here.
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
