/**
 * app/[locale]/admin/pages/about/milestones/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Milestones: add at the top, every existing milestone editable in place —
 * same arrangement as /admin/pages/about/awards. Reordering is the sortOrder field on
 * each form, not drag-and-drop, matching every other list in this admin.
 *
 * Grouped by year in the list, purely as a reading aid — sortOrder is what
 * actually decides the public page's order, and rows already come back
 * sorted by year first (same as the public query in lib/milestones.ts), so
 * grouping here is a matter of not repeating a year heading, not a second
 * sort.
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { formatYear } from "@/lib/format";
import { createMilestone, deleteMilestone, updateMilestone } from "./actions";
import MilestoneForm from "@/components/admin/MilestoneForm";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";

/** From this year the timeline draws stops in sand: the current run of
 *  developments. One constant, so moving the line is a one-word edit. */
const RECENT_FROM_YEAR = 2021;

type Props = { params: Promise<{ locale: string }> };

export default async function AdminMilestonesPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  /* VIEWER may open this page to see what is published; only EDITOR
     and above may submit either form below (canWrite gates both with a
     disabled fieldset, matching the zone's real minimum, unchanged from
     before this phase — see the actions in ./actions.ts). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;

  const milestones = await safeQuery(
    "admin:milestones",
    () =>
      db.milestone.findMany({
        orderBy: [{ year: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    [] as Awaited<ReturnType<typeof db.milestone.findMany>>,
  );

  // Adjacent-run grouping, same trick the public page uses: milestones is
  // already sorted by year, so a year only needs a heading the first time
  // it's seen.
  let lastYearHeading: number | null = null;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title={t("milestones.title")}
        description={t("milestones.subtitle")}
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── Timeline ────────────────────────────────────────────────
          The years as the About page tells them, left to right; from
          2021 — when the current developments began — in sand. It
          scrolls sideways inside its card, never the page. Each stop
          jumps to its form below. */}
      {milestones.length > 0 && (
        <section className="admin-card overflow-hidden p-0!">
          <ol className="flex gap-0 overflow-x-auto px-5 py-6">
            {[...milestones]
              .sort((a, b) => a.year - b.year || a.sortOrder - b.sortOrder)
              .map((milestone) => {
                const recent = milestone.year >= RECENT_FROM_YEAR;
                return (
                  <li key={milestone.id} className="relative min-w-[150px] flex-1 pr-4">
                    <span aria-hidden className="absolute left-0 right-0 top-[7px] h-0.5 bg-adm-line" />
                    <a href={`#milestone-${milestone.id}`} className="group relative block">
                      <span
                        aria-hidden
                        className={[
                          "block h-4 w-4 rounded-full border-2 border-adm-solid",
                          recent ? "bg-adm-fill" : "bg-adm-info",
                          milestone.isActive ? "" : "opacity-40",
                        ].join(" ")}
                      />
                      <span className={`mt-2 block text-sm font-semibold tabular-nums ${recent ? "text-adm-accent-ink" : "text-ink"}`}>
                        {formatYear(milestone.year)}
                      </span>
                      <span className="block text-xs leading-snug text-ink group-hover:text-primary-500">
                        {milestone.projectName}
                      </span>
                      {milestone.brand && <span className="block text-[11px] text-ink-muted">{milestone.brand}</span>}
                    </a>
                  </li>
                );
              })}
          </ol>
        </section>
      )}

      {/* ── Add ─────────────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("milestones.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <MilestoneForm action={createMilestone.bind(null, locale)} submitLabel={t("common.create")} />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {milestones.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("milestones.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {milestones.map((milestone) => {
            const showYearHeading = milestone.year !== lastYearHeading;
            lastYearHeading = milestone.year;

            return (
              <div key={milestone.id} id={`milestone-${milestone.id}`} className="scroll-mt-[120px]">
                {showYearHeading && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-700">
                    {formatYear(milestone.year)}
                  </p>
                )}

                <section className="admin-card">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-primary">
                      {milestone.projectName}
                    </h2>

                    <span
                      className={
                        milestone.isActive
                          ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                          : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                      }
                    >
                      {milestone.isActive ? t("milestones.active") : t("milestones.inactive")}
                    </span>
                  </div>

                  <fieldset disabled={!canWrite} className="contents">
                    <MilestoneForm
                      action={updateMilestone.bind(null, locale, milestone.id)}
                      onDelete={deleteMilestone.bind(null, locale, milestone.id)}
                      values={{
                        year: String(milestone.year),
                        projectName: milestone.projectName,
                        brand: milestone.brand ?? "",
                        imageUrl: milestone.imageUrl ?? "",
                        isActive: milestone.isActive,
                        sortOrder: String(milestone.sortOrder),
                      }}
                      submitLabel={t("common.save")}
                    />
                  </fieldset>
                </section>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
