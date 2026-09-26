/**
 * lib/reports/audience.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who a report is for, and turning the drafted note into text.
 *
 * The three audiences are not three levels of detail on one report. They
 * are three different questions: an executive asks whether the money is
 * working, marketing asks which pages and phrases to write next, and the
 * engineers ask what is broken. The same figure belongs in one of them and
 * is noise in the others.
 *
 * Only the executive report is fully built today. Marketing's half needs
 * Search Console (phase 4) and engineering's needs index coverage (phase
 * 5); both render what exists and say plainly what does not, which is why
 * the sections each audience wants are listed here rather than hardcoded
 * into the page — a later phase turns one flag and the report grows.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { getTranslations } from "next-intl/server";
import { lastMonth, type Period } from "@/lib/reports/period";
import { draftNote } from "@/lib/reports/draft-note";
import type { ReportData } from "@/lib/reports/seo-report";

export const AUDIENCES = ["executive", "marketing", "engineering"] as const;

export type Audience = (typeof AUDIENCES)[number];

export function isAudience(value: string | undefined): value is Audience {
  return (AUDIENCES as readonly string[]).includes(value ?? "");
}

/** Which blocks each audience's report carries. */
export const AUDIENCE_SECTIONS: Record<Audience, readonly string[]> = {
  executive: ["headline", "projects", "notes"],
  marketing: ["headline", "projects", "search", "notes"],
  engineering: ["headline", "audit", "vitals", "indexing", "notes"],
};

/**
 * Rebuild a period from the month key a form posted back.
 *
 * The client round-trips `noteKey` — the first day of the covered month —
 * because that is what identifies the note it edited. Reconstructing the
 * full period from it here keeps the action from having to trust a start
 * and an end supplied separately, which could name a window that never
 * appeared on anybody's screen.
 */
export function periodFromNoteKey(noteKey: Date): Period {
  const start = new Date(
    Date.UTC(noteKey.getUTCFullYear(), noteKey.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(noteKey.getUTCFullYear(), noteKey.getUTCMonth() + 1, 1),
  );

  return { kind: "lastMonth", start, end, noteKey: start };
}

/** The period a report screen or a scheduled send defaults to. */
export function defaultPeriod(now: Date = new Date()): Period {
  return lastMonth(now);
}

/**
 * The drafted note as text in the report's language.
 *
 * draft-note.ts decides *what* to say and this turns it into sentences
 * through the message files, so a missing Russian string fails
 * tests/i18n.test.ts rather than appearing as English in a Russian report.
 */
export async function draftNoteText(
  locale: string,
  data: ReportData,
): Promise<string> {
  const t = await getTranslations({ locale, namespace: "admin" });

  return draftNote(data)
    .map((item) => {
      switch (item.key) {
        case "auditIssue":
          return t("reports.draft.auditIssue", {
            // The audit tab's own name for the rule, so the note and the
            // table a reader opens next call the same thing by one name.
            rule: t(`seo.audit.rules.${item.rule}` as never),
            count: item.count,
          });
        case "vitalsPoor":
          return t("reports.draft.vitalsPoor", {
            metric: item.metric,
            value: item.value,
          });
        case "topProject":
          return t("reports.draft.topProject", {
            project: item.project,
            leads: item.leads,
          });
        case "noGoogleLeads":
          return t("reports.draft.noGoogleLeads", { project: item.project });
        case "notConnected":
          return t("reports.draft.notConnected");
      }
    })
    .join("\n");
}
