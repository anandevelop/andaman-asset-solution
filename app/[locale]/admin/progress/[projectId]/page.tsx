/**
 * app/[locale]/admin/progress/[projectId]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Monthly progress manager for one project. Every existing month renders
 * its own independent form, so an editor can correct August without the
 * unsaved state of September riding along on the same submit.
 *
 * The "add" form defaults to the month after the newest entry — the common
 * case is appending this month's site photos, not backfilling.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { formatMonthYear, intlLocale } from "@/lib/format";
import { createProgress, deleteProgress, updateProgress } from "../actions";
import ProgressForm, { type ProgressValues } from "@/components/admin/ProgressForm";

type Props = { params: { locale: string; projectId: string } };

/** Localised month names for the <select>, in calendar order. */
function monthNames(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), { month: "long" });
  return Array.from({ length: 12 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2026, index, 1))),
  );
}

export default async function AdminProgressPage({ params }: Props) {
  const { locale, projectId } = params;
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, slug: true, nameEn: true, nameTh: true },
  });

  if (!project) notFound();

  const updates = await prisma.projectProgress.findMany({
    where: { projectId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      id: true,
      month: true,
      year: true,
      titleEn: true,
      titleTh: true,
      summaryEn: true,
      summaryTh: true,
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
    titleEn: "",
    titleTh: "",
    summaryEn: "",
    summaryTh: "",
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

      {/* ── Add a month ─────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("progress.addTitle")}
        </h2>

        <ProgressForm
          action={createProgress.bind(null, locale, projectId)}
          values={blank}
          submitLabel={t("common.create")}
          projectSlug={project.slug}
          monthLabels={months}
        />
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
                      ? "rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                      : "rounded-sm bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                  }
                >
                  {update.isPublished ? t("common.published") : t("common.draft")}
                </span>
              </div>

              <ProgressForm
                action={updateProgress.bind(null, locale, projectId, update.id)}
                onDelete={deleteProgress.bind(null, locale, projectId, update.id)}
                values={{
                  month: update.month,
                  year: update.year,
                  titleEn: update.titleEn ?? "",
                  titleTh: update.titleTh ?? "",
                  summaryEn: update.summaryEn ?? "",
                  summaryTh: update.summaryTh ?? "",
                  images: update.images.join("\n"),
                  isPublished: update.isPublished,
                }}
                submitLabel={t("common.save")}
                projectSlug={project.slug}
                monthLabels={months}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
