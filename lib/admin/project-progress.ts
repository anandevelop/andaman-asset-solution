import "server-only";

/**
 * lib/admin/project-progress.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the construction-progress page (Progress.dc.html) — the
 * phase timeline across the top, the monthly log below it, and the count
 * of buyers a publish would email.
 *
 * The headline percentage and the "+7% since last month" beside it are
 * derived from the log rather than stored: the newest published entry is
 * the current figure by definition, and a separate total would be a second
 * number to keep in step with it — and the one that would go stale.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PhaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

export type PhaseView = {
  id: string;
  name: string;
  status: PhaseStatus;
  percentComplete: number;
  milestoneDate: Date | null;
  sortOrder: number;
};

export type ProgressEntryView = {
  id: string;
  month: number;
  year: number;
  percentComplete: number | null;
  summary: string | null;
  images: string[];
  isPublished: boolean;
  authorName: string | null;
  updatedAt: Date;
};

export type ProgressOverview = {
  phases: PhaseView[];
  entries: ProgressEntryView[];
  /** Newest published entry's figure — the page's headline number. */
  overallPercent: number | null;
  /** Step up from the entry before it, or null when there is no earlier
   *  one to compare against. */
  deltaPercent: number | null;
  publishedCount: number;
  /** How many buyers a publish would email — see buyerEmailsFor(). */
  buyerCount: number;
};

const EMPTY: ProgressOverview = {
  phases: [],
  entries: [],
  overallPercent: null,
  deltaPercent: null,
  publishedCount: 0,
  buyerCount: 0,
};

/**
 * The people who have bought into this development, by email.
 *
 * A buyer is the lead attached to a unit that has been marked SOLD — the
 * link the Lead Detail page's reservation makes and the Units page keeps
 * when the sale completes (see reservationPatchFor in the units actions,
 * which clears the expiry but deliberately keeps the lead).
 *
 * That means a unit sold outside this system, or one whose reservation was
 * never linked to a lead, has no contactable buyer here. The page reports
 * the count it can actually reach rather than the number of sold units,
 * because those are different numbers and the difference matters when
 * someone is about to press "notify buyers".
 */
export async function buyerEmailsFor(projectId: string): Promise<{ email: string; name: string }[]> {
  const units = await prisma.projectUnit.findMany({
    where: { projectId, status: "SOLD", reservedByLeadId: { not: null } },
    select: { reservedByLead: { select: { email: true, name: true } } },
  });

  const byEmail = new Map<string, { email: string; name: string }>();
  for (const unit of units) {
    const lead = unit.reservedByLead;
    // One buyer may hold several units; they get one email, not three.
    if (lead?.email) byEmail.set(lead.email.toLowerCase(), { email: lead.email, name: lead.name });
  }

  return [...byEmail.values()];
}

export async function getProgressOverview(
  projectId: string,
  locale: string,
): Promise<ProgressOverview> {
  return safeQuery(
    "admin:project:progress",
    async () => {
      const [phases, rows, buyers] = await Promise.all([
        prisma.projectPhase.findMany({
          where: { projectId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
        prisma.projectProgress.findMany({
          where: { projectId },
          orderBy: [{ year: "desc" }, { month: "desc" }],
          include: {
            author: { select: { name: true } },
            translations: { select: { locale: true, summary: true } },
          },
        }),
        buyerEmailsFor(projectId),
      ]);

      const entries: ProgressEntryView[] = rows.map((row) => ({
        id: row.id,
        month: row.month,
        year: row.year,
        percentComplete: row.percentComplete,
        summary:
          row.translations.find((t) => t.locale === locale)?.summary ??
          // Falling back to any locale that has text beats showing an
          // empty card for an entry that does have a write-up.
          row.translations.find((t) => (t.summary ?? "").trim().length > 0)?.summary ??
          null,
        images: row.images,
        isPublished: row.isPublished,
        authorName: row.author?.name ?? null,
        updatedAt: row.updatedAt,
      }));

      // Published entries only: a draft nobody has approved is not the
      // figure the development is actually at.
      const published = entries.filter(
        (entry) => entry.isPublished && entry.percentComplete !== null,
      );

      return {
        phases: phases.map((phase) => ({
          id: phase.id,
          name: locale === "th" ? phase.nameTh : phase.nameEn,
          status: phase.status,
          percentComplete: phase.percentComplete,
          milestoneDate: phase.milestoneDate,
          sortOrder: phase.sortOrder,
        })),
        entries,
        overallPercent: published[0]?.percentComplete ?? null,
        deltaPercent:
          published.length >= 2 && published[0].percentComplete !== null && published[1].percentComplete !== null
            ? published[0].percentComplete - published[1].percentComplete
            : null,
        publishedCount: entries.filter((entry) => entry.isPublished).length,
        buyerCount: buyers.length,
      };
    },
    EMPTY,
  );
}
