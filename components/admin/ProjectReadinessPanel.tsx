/**
 * components/admin/ProjectReadinessPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The five things a project needs before it is finished, and which tab
 * fixes each one.
 *
 * The workspace's seven tabs each show their own slice and none of them
 * says whether the others are done, so "what is left on this project" meant
 * opening all seven and remembering. Every row here is a link to the tab
 * that fixes it — a checklist whose items are not actionable is a list of
 * complaints.
 *
 * A failing check is amber, not red. None of this blocks publishing (see
 * lib/admin/project-readiness.ts's header: the gate is `contentStatus`, and
 * a missing Russian tagline must never hold a launch), so red would be
 * claiming an authority this panel does not have.
 *
 * A plain server component — every row is a Link to a real route.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check, ChevronRight, Minus } from "lucide-react";
import { LOCALE_NATIVE_NAMES } from "@/lib/locale-completeness";
import type { ProjectReadiness, ReadinessTab } from "@/lib/admin/project-readiness";

/** The tab each check sends you to. Mirrors ProjectHubTabs' own hrefs —
 *  "units" lands on the site plan there too, for the same reason. */
const TAB_SEGMENT: Record<ReadinessTab, string> = {
  overview: "/edit",
  content: "/content",
  seo: "/seo",
  units: "/site-plan",
  progress: "/progress",
};

const FILL_TONE: Record<string, string> = {
  complete: "bg-emerald-600",
  partial: "bg-amber-500",
  missing: "bg-red-500/70",
};

export default async function ProjectReadinessPanel({
  locale,
  projectId,
  readiness,
}: {
  locale: string;
  projectId: string;
  readiness: ProjectReadiness;
}) {
  const t = await getTranslations({ locale, namespace: "admin" });

  const base = `/${locale}/admin/projects/${projectId}`;
  const total = readiness.checks.length;

  if (total === 0) return null;

  return (
    <aside className="admin-card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-primary">{t("projects.readiness.title")}</h2>
        <p className="mt-1 text-xs text-ink-muted">
          {t("projects.readiness.summary", { passed: readiness.passed, total })}
        </p>
        {/* Says what the list is not, where somebody would otherwise assume
            a failing row is why their publish switch is refusing them. */}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          {t("projects.readiness.adviceNote")}
        </p>
      </div>

      <ul className="space-y-1">
        {readiness.checks.map((check) => {
          const count =
            check.total !== undefined
              ? t("projects.readiness.countOf", { done: check.done ?? 0, total: check.total })
              : check.done !== undefined
                ? t("projects.readiness.count", { done: check.done })
                : null;

          return (
            <li key={check.key}>
              <Link
                href={`${base}${TAB_SEGMENT[check.tab]}`}
                className="group flex items-center gap-2.5 rounded-xs px-2 py-1.5 transition-colors hover:bg-surface-muted"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    check.ok ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {check.ok ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
                </span>

                <span className={`flex-1 text-xs ${check.ok ? "text-ink-muted" : "font-medium text-ink"}`}>
                  {t(`projects.readiness.check.${check.key}` as never)}
                  {count && <span className="ml-1.5 tabular-nums text-ink-muted">{count}</span>}
                </span>

                {!check.ok && (
                  <ChevronRight
                    size={13}
                    aria-hidden
                    className="shrink-0 text-ink-muted/50 transition-colors group-hover:text-primary"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* The four locales as bars rather than a fifth checklist row: the
          row above says how many are complete, this says which. */}
      <div className="space-y-1.5 border-t border-primary/10 pt-3.5">
        {readiness.localeFills.map((entry) => (
          <div key={entry.locale} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-ink-muted">
              {LOCALE_NATIVE_NAMES[entry.locale] ?? entry.locale}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/5">
              <span
                className={`block h-full rounded-full ${FILL_TONE[entry.fill]}`}
                style={{ width: entry.fill === "complete" ? "100%" : entry.fill === "partial" ? "55%" : "8%" }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-[10.5px] text-ink-muted">
              {t(`projects.readiness.fill.${entry.fill}` as never)}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
