/**
 * app/[locale]/admin/(catalog)/projects/[id]/progress/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Monthly progress manager for one project. Every existing month renders
 * its own independent form, so an editor can correct August without the
 * unsaved state of September riding along on the same submit.
 *
 * The "add" form defaults to the month after the newest entry — the common
 * case is appending this month's site photos, not backfilling.
 *
 * WHY IT IS UNDER /projects/[id] NOW
 *
 * It was /admin/progress/[projectId] — a tab of the project workspace that
 * navigated out of the project workspace. The sidebar highlight jumped from
 * "Projects" to "Progress" on the way in, the tab bar stayed but the URL
 * said you were somewhere else, and going "back" from here landed on the
 * cross-project progress list rather than the project you were editing.
 * The cross-project list is still at /admin/progress; only the per-project
 * screen moved, and next.config.js redirects the old address.
 *
 * The write side stays at (catalog)/progress/actions.ts, shared with that
 * list — imported rather than copied, since it is the same mutation.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { formatMonthYear, intlLocale } from "@/lib/format";
import {
  createProgress,
  deleteProgress,
  updateProgress,
} from "@/app/[locale]/admin/(catalog)/progress/actions";
import ProgressForm, { type ProgressValues } from "@/components/admin/ProgressForm";
import ProgressPhaseTimeline from "@/components/admin/ProgressPhaseTimeline";
import ProgressWorkspace, { type ProgressCard } from "@/components/admin/ProgressWorkspace";
import { getProgressOverview } from "@/lib/admin/project-progress";

type Props = { params: Promise<{ locale: string; id: string }> };

/** Localised month names for the <select>, in calendar order. */
function monthNames(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), { month: "long" });
  return Array.from({ length: 12 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2026, index, 1))),
  );
}

export default async function AdminProgressPage(props: Props) {
  const params = await props.params;
  // `id` is the segment name this route tree already uses for a project;
  // the rest of this file still calls it projectId, which is what the
  // progress actions and ProjectHubTabs expect.
  const { locale, id: projectId } = params;
  /* VIEWER may open this workspace to see a project's own progress log;
     logging a new month or editing an existing one stays behind a
     disabled fieldset for anyone below EDITOR, unchanged from before this
     phase. */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, slug: true, nameEn: true, nameTh: true },
  });

  if (!project) notFound();

  const overview = await getProgressOverview(projectId, locale);

  /* "Done · Jan 26" / "Starts · Oct 26" / "Expected · Jun 27" — what the
     stored date means comes from the phase's status, not a second column
     (see ProjectPhase.milestoneDate). */
  const phaseDateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "2-digit",
  });

  const phaseCaptions = Object.fromEntries(
    overview.phases.map((phase) => {
      if (!phase.milestoneDate) {
        return [phase.id, t(`progress.phaseStatus.${phase.status}` as never)];
      }
      const when = phaseDateFormat.format(phase.milestoneDate);
      return [
        phase.id,
        `${t(`progress.phaseStatus.${phase.status}` as never)} · ${when}`,
      ];
    }),
  );

  const progressCards: ProgressCard[] = overview.entries.map((entry) => ({
    id: entry.id,
    monthLabel: formatMonthYear(locale, entry.year, entry.month),
    percentComplete: entry.percentComplete,
    summary: entry.summary,
    images: entry.images,
    isPublished: entry.isPublished,
    authorLine: [
      entry.authorName ? t("progress.recordedBy", { name: entry.authorName }) : null,
      new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" }).format(
        entry.updatedAt,
      ),
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  const updates = await prisma.projectProgress.findMany({
    where: { projectId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      id: true,
      month: true,
      year: true,
      videoUrl: true,
      images: true,
      isPublished: true,
    },
  });

  const projectName = locale === "th" ? project.nameTh : project.nameEn;
  const months = monthNames(locale);

  // Default the new-entry form to the month after the latest record.
  const latest = updates[0];
  const now = new Date();
  const nextMonth = latest
    ? latest.month === 12
      ? { month: 1, year: latest.year + 1 }
      : { month: latest.month + 1, year: latest.year }
    : { month: now.getMonth() + 1, year: now.getFullYear() };

  const blank: ProgressValues = {
    ...nextMonth,
    videoUrl: "",
    images: "",
    isPublished: false,
  };

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/projects`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("progress.backToProjects")}
        </Link>

        <p className="admin-section-title mt-4">{t("progress.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {projectName}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {t("progress.subtitle", { project: projectName })}
        </p>
      </header>

      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="progress"
      />

      <ProgressPhaseTimeline
        phases={overview.phases}
        overallPercent={overview.overallPercent}
        deltaPercent={overview.deltaPercent}
        captions={phaseCaptions}
        labels={{
          overall: t("progress.overall"),
          delta: t("progress.delta", { delta: "{delta}" }),
          noData: t("progress.noPublishedYet"),
          empty: t("progress.noPhases"),
        }}
      />

      <fieldset disabled={!canWrite} className="contents">
      <ProgressWorkspace
        locale={locale}
        projectId={project.id}
        entries={progressCards}
        buyerCount={overview.buyerCount}
        nextPeriod={{
          month: nextMonth.month,
          year: nextMonth.year,
          label: formatMonthYear(locale, nextMonth.year, nextMonth.month),
        }}
        labels={{
          logTitle: t("progress.logTitle"),
          logCount: t("progress.logCount", {
            total: overview.entries.length,
            published: overview.publishedCount,
          }),
          draftTag: t("progress.draftTag"),
          published: t("progress.publishedToggle"),
          addTitle: t("progress.addNewTitle"),
          period: t("progress.period"),
          percent: t("progress.percent"),
          summaryTh: t("progress.summaryTh"),
          summaryEn: t("progress.summaryEn"),
          summaryPlaceholder: t("progress.summaryPlaceholder"),
          notTranslated: t("progress.notTranslated"),
          images: t("progress.images"),
          imagesHint: t("progress.imagesHint"),
          imagesHelp: t("progress.imagesHelp"),
          notifyNobody: t("progress.notifyNobody"),
          saveDraft: t("progress.saveDraft"),
          publish: t("progress.publish"),
          saved: t("common.saved"),
          error: t("common.error"),
          empty: t("progress.empty"),
        }}
      />
      </fieldset>

      {/* ── Add a month ─────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("progress.addTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <ProgressForm
            action={createProgress.bind(null, locale, projectId)}
            values={blank}
            submitLabel={t("common.create")}
            projectSlug={project.slug}
            monthLabels={months}
          />
        </fieldset>
      </section>

      {/* ── Existing months ─────────────────────────────────────────── */}
      {updates.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("progress.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {updates.map((update) => (
            <section key={update.id} className="admin-card">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-primary">
                  {formatMonthYear(locale, update.year, update.month)}
                </h2>

                <span
                  className={
                    update.isPublished
                      ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                      : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                  }
                >
                  {update.isPublished ? t("common.published") : t("common.draft")}
                </span>
              </div>

              <fieldset disabled={!canWrite} className="contents">
                <ProgressForm
                  action={updateProgress.bind(null, locale, projectId, update.id)}
                  onDelete={deleteProgress.bind(null, locale, projectId, update.id)}
                  values={{
                    month: update.month,
                    year: update.year,
                    videoUrl: update.videoUrl ?? "",
                    images: update.images.join("\n"),
                    isPublished: update.isPublished,
                  }}
                  submitLabel={t("common.save")}
                  projectSlug={project.slug}
                  monthLabels={months}
                />
              </fieldset>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
