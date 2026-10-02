/**
 * app/[locale]/admin/(content)/publishing/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Publishing.dc.html — the draft → review → publish dashboard, and the
 * index tab of the hub. See lib/publishing.ts for the read side,
 * ./actions.ts for the state machine, and ./layout.tsx for the header and
 * the tab strip this page no longer draws for itself.
 *
 * VIEWER and above can open this page — the queue itself is a read, and an
 * auditor asking "what is waiting on review right now" is exactly what
 * lib/permissions.ts's viewContent grant is for. Every row's actions stay
 * inside a disabled fieldset for anyone below EDITOR: moving something
 * into review is still a write, unchanged from before this phase.
 * Approve/reject/revert are further gated to ADMIN+ inside
 * PublishingRowActions and the actions themselves — see those files'
 * headers.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, Circle, Clock, FileEdit } from "lucide-react";
import { ContentStatus, Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import {
  getPublishingOverview,
  getRevisionHistory,
  typeLabelKey,
  REVISION_RETENTION_DAYS,
  type ChangeChip,
} from "@/lib/publishing";
import { intlLocale } from "@/lib/format";
import { visibleTabs } from "@/lib/admin/nav";
import PublishingRowActions from "@/components/admin/PublishingRowActions";
import PublishingRevisionPanel from "@/components/admin/PublishingRevisionPanel";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ item?: string }>;
};

/** Chips beyond this are summarised as "+N more". */
const MAX_VISIBLE_CHIPS = 4;

const EDIT_PATH: Record<string, string> = {
  PROJECT: "projects",
  NEWS_ARTICLE: "news",
  EVENT: "events",
  E_BROCHURE: "e-brochures",
};

export default async function AdminPublishingPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const session = await requireAdmin(locale, Role.VIEWER);
  const canSeeTranslations = visibleTabs(session.role, "publishing").some((tab) => tab.key === "translations");
  const t = await getTranslations({ locale, namespace: "admin.publishing" });
  const tRoot = await getTranslations({ locale, namespace: "admin" });

  const overview = await getPublishingOverview();
  const canReview = hasRole(session.role, Role.ADMIN);
  const canWrite = hasRole(session.role, Role.EDITOR);

  /*
    Which record the history panel is about. Defaults to the first thing in
    the queue — the panel beside a queue is only useful if it is already
    showing something, and the top of the queue is what a reviewer opens
    the page to deal with.
  */
  const selected =
    overview.reviewQueue.find((row) => `${row.type}:${row.id}` === searchParams.item) ??
    overview.reviewQueue[0] ??
    null;

  const history = selected ? await getRevisionHistory(selected.type, selected.id) : [];

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const rowLabels = {
    startDraft: t("actions.startDraft"),
    submit: t("actions.submit"),
    approve: t("actions.approve"),
    reject: t("actions.reject"),
    error: tRoot("common.error"),
  };
  const revisionLabels = {
    toggle: t("revision.toggle"),
    compareTitle: t("revision.compareTitle"),
    noRevisionYet: t("revision.noRevisionYet"),
    currentLabel: t("revision.currentLabel"),
    publishedLabel: t("revision.publishedLabel"),
    historyTitle: t("revision.historyTitle"),
    historyEmpty: t("revision.historyEmpty"),
    revertAction: t("revision.revertAction"),
    confirmRevert: t("revision.confirmRevert"),
    error: tRoot("common.error"),
    autoEditBadge: t("revision.autoEditBadge"),
  };

  function statusChip(row: (typeof overview.allRows)[number]) {
    if (row.contentStatus === ContentStatus.DRAFT) {
      return <span className="rounded-xs bg-adm-text/4 px-2 py-1 text-[11px] font-semibold text-adm-muted">{t("table.statusDraft")}</span>;
    }
    if (row.contentStatus === ContentStatus.IN_REVIEW) {
      return <span className="rounded-xs bg-adm-fill/15 px-2 py-1 text-[11px] font-semibold text-adm-accent-ink">{t("table.statusReview")}</span>;
    }
    if (row.scheduledPublishAt) {
      return (
        <span className="rounded-xs bg-adm-text/5 px-2 py-1 text-[11px] font-semibold text-adm-text">
          {t("table.statusScheduled", { date: dateFormat.format(row.scheduledPublishAt) })}
        </span>
      );
    }
    if (row.isPublished) {
      return <span className="rounded-xs bg-adm-success-bg px-2 py-1 text-[11px] font-semibold text-adm-success">{t("table.statusPublished")}</span>;
    }
    return <span className="rounded-xs bg-adm-danger-bg px-2 py-1 text-[11px] font-semibold text-adm-danger">{t("table.statusUnpublished")}</span>;
  }

  /**
   * One chip's text. A translation chip carries the locale it belongs to
   * ("Tagline (TH)"); a plain field chip is a name out of the audit trail,
   * translated when this app has a label for it and shown verbatim when it
   * does not — a raw column name is a worse label than a real one, but a
   * better one than silently dropping the fact that something changed.
   */
  function chipText(chip: ChangeChip): string {
    const label = t.has(`changed.field.${chip.field}` as never)
      ? t(`changed.field.${chip.field}` as never)
      : chip.field;

    return chip.kind === "translation"
      ? `${label} (${chip.locale.toUpperCase()})`
      : label;
  }

  const LOCALE_STATE_TONE: Record<string, string> = {
    live: "bg-adm-success-bg text-adm-success",
    draft: "bg-adm-fill/15 text-adm-accent-ink",
    missing: "bg-adm-danger-bg text-adm-danger",
  };

  return (
    /* No header here: the hub layout draws it above the tab strip, so
       this page starts at its own content. */
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="admin-card space-y-1">
          <span className="flex items-center gap-2 text-xs text-adm-muted"><Circle size={8} className="fill-current text-adm-muted" aria-hidden />{t("stats.draft")}</span>
          <span className="block text-2xl font-semibold text-adm-text">{overview.draftCount}</span>
          <span className="block text-[11px] text-adm-muted">
            {overview.draftOldestDays !== null ? t("stats.draftOldest", { days: overview.draftOldestDays }) : t("stats.none")}
          </span>
        </div>
        <div className="admin-card space-y-1 border-accent-300">
          <span className="flex items-center gap-2 text-xs font-medium text-adm-accent-ink"><Clock size={12} aria-hidden />{t("stats.review")}</span>
          <span className="block text-2xl font-semibold text-adm-accent-ink">{overview.reviewCount}</span>
          <span className="block text-[11px] text-adm-muted">
            {overview.reviewAvgWaitDays !== null ? t("stats.reviewAvgWait", { days: overview.reviewAvgWaitDays }) : t("stats.none")}
          </span>
        </div>
        <div className="admin-card space-y-1">
          <span className="flex items-center gap-2 text-xs text-adm-muted"><FileEdit size={12} aria-hidden />{t("stats.scheduled")}</span>
          <span className="block text-2xl font-semibold text-adm-text">{overview.scheduledCount}</span>
          <span className="block text-[11px] text-adm-muted">
            {overview.scheduledNext ? t("stats.scheduledNext", { date: dateFormat.format(overview.scheduledNext) }) : t("stats.none")}
          </span>
        </div>
        <div className="admin-card space-y-1">
          <span className="flex items-center gap-2 text-xs text-adm-muted"><CheckCircle2 size={12} className="text-adm-success" aria-hidden />{t("stats.publishedWeek")}</span>
          <span className="block text-2xl font-semibold text-adm-text">{overview.publishedThisWeekCount}</span>
          <span className="block text-[11px] text-adm-muted">{t("stats.publishedWeekNote")}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
      <section className="admin-card space-y-4 lg:col-span-2">
        <h2 className="text-sm font-semibold text-adm-text">{t("queue.title")}</h2>
        {/* Nothing waiting is good news, and says so — then points at the
            other half of this hub, where there is usually still work. The
            link only for a role the translations tab admits (EDITOR_UP). */}
        {overview.reviewQueue.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-adm-success-bg text-adm-success">
              <CheckCircle2 size={24} aria-hidden />
            </span>
            <p className="text-sm font-semibold text-adm-text">{t("queue.emptyTitle")}</p>
            {canSeeTranslations && (
              <Link
                href={`/${locale}/admin/publishing/translations`}
                className="text-xs font-medium text-adm-info hover:underline"
              >
                {t("queue.emptyTranslationsLink")}
              </Link>
            )}
          </div>
        )}
        <div className="space-y-3">
          {overview.reviewQueue.map((row) => (
            <div
              key={`${row.type}-${row.id}`}
              className={`space-y-2.5 rounded-xs border p-3.5 ${
                selected && selected.type === row.type && selected.id === row.id
                  ? "border-adm-fill/50 bg-adm-fill/4"
                  : "border-adm-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* Points the history panel at this record. A plain link so
                    it survives a refresh and can be sent to someone. */}
                <Link
                  href={`/${locale}/admin/publishing?item=${row.type}:${row.id}`}
                  scroll={false}
                  className="text-sm font-semibold text-adm-text hover:text-adm-accent-ink"
                >
                  {row.title}
                </Link>
                <span className="text-xs text-adm-muted">
                  {tRoot(`nav.${typeLabelKey(row.type)}` as never)}
                  {row.lastActorEmail && ` · ${row.lastActorEmail}`}
                  {row.lastActorAt && ` · ${dateFormat.format(row.lastActorAt)}`}
                </span>
              </div>

              {/* What is actually waiting to be approved. See ChangeChip
                  in lib/publishing.ts for why a translation chip can name
                  its locale and a plain field chip cannot. */}
              {(row.changed.length > 0 || row.localeStates.some((l) => l.state !== "missing")) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {row.changed.slice(0, MAX_VISIBLE_CHIPS).map((chip, index) => (
                    <span
                      key={`${chip.kind}-${chip.field}-${index}`}
                      className="rounded-xs bg-adm-text/4 px-2 py-0.5 text-[11px] font-medium text-adm-text"
                    >
                      {chipText(chip)}
                    </span>
                  ))}
                  {row.changed.length > MAX_VISIBLE_CHIPS && (
                    <span className="text-[11px] text-adm-muted">
                      {t("changed.more", { count: row.changed.length - MAX_VISIBLE_CHIPS })}
                    </span>
                  )}
                  {row.changed.length === 0 && (
                    <span className="text-[11px] text-adm-muted">{t("changed.none")}</span>
                  )}

                  <span className="ml-1 flex gap-1">
                    {row.localeStates
                      .filter((entry) => entry.state !== "missing")
                      .map((entry) => (
                        <span
                          key={entry.locale}
                          className={`rounded-xs px-1.5 py-0.5 text-[10px] font-bold uppercase ${LOCALE_STATE_TONE[entry.state]}`}
                        >
                          {entry.locale}
                        </span>
                      ))}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/${locale}/admin/${EDIT_PATH[row.type]}/${row.id}/edit`}
                  className="text-xs font-medium text-adm-accent-ink hover:text-adm-accent-ink"
                >
                  {t("queue.openEdit")}
                </Link>
                <PublishingRevisionPanel locale={locale} type={row.type} id={row.id} labels={revisionLabels} />
                <div className="ml-auto">
                  <fieldset disabled={!canWrite} className="contents">
                    <PublishingRowActions
                      locale={locale}
                      type={row.type}
                      id={row.id}
                      contentStatus={row.contentStatus}
                      canReview={canReview}
                      labels={rowLabels}
                    />
                  </fieldset>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Version history for whichever record the queue is pointed at. */}
      <section className="admin-card space-y-3">
        <h2 className="text-sm font-semibold text-adm-text">
          {t("revision.historyTitle")}
          {selected && <span className="text-adm-muted"> · {selected.title}</span>}
        </h2>

        {!selected ? (
          <p className="text-sm text-adm-muted">{t("queue.empty")}</p>
        ) : (
          <>
            {/* The edit awaiting review is not a revision yet — nothing has
                snapshotted it — so it is shown from the record itself
                rather than invented as one. */}
            <div className="flex items-start justify-between gap-3 border-b border-adm-line pb-2.5">
              <div>
                <p className="text-xs font-semibold text-adm-text">{t("revision.currentDraft")}</p>
                <p className="mt-0.5 text-[11px] text-adm-muted">
                  {selected.lastActorAt ? dateFormat.format(selected.lastActorAt) : "—"}
                  {selected.lastActorEmail && ` · ${selected.lastActorEmail}`}
                  {selected.changed.length > 0 &&
                    ` · ${t("revision.fieldCount", { count: selected.changed.length })}`}
                </p>
              </div>
              <span className="shrink-0 rounded-xs bg-adm-fill/15 px-2 py-0.5 text-[10px] font-semibold text-adm-accent-ink">
                {t("table.statusDraft")}
              </span>
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-adm-muted">{t("revision.historyEmpty")}</p>
            ) : (
              <ul className="space-y-2.5">
                {history.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-adm-text">
                        <span className="text-adm-muted">v{item.version}</span>{" "}
                        {item.isLive ? t("revision.liveVersion") : t("revision.olderVersion")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-adm-muted">
                        {dateFormat.format(item.createdAt)}
                        {item.createdByName && ` · ${item.createdByName}`}
                        {item.changedFieldCount !== null &&
                          ` · ${t("revision.fieldCount", { count: item.changedFieldCount })}`}
                      </p>
                    </div>
                    {item.isLive && (
                      <span className="shrink-0 rounded-xs bg-adm-success-bg px-2 py-0.5 text-[10px] font-semibold text-adm-success">
                        {t("table.statusPublished")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="rounded-xs bg-adm-text/4 px-3 py-2 text-[11px] leading-relaxed text-adm-muted">
              {t("revision.retentionNote", { days: REVISION_RETENTION_DAYS })}
            </p>
          </>
        )}
      </section>
      </div>

      <section className="admin-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-adm-line px-4 py-3">
          <h2 className="text-sm font-semibold text-adm-text">{t("table.title")}</h2>
          <div className="flex items-center gap-3 text-[11px] text-adm-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-xs bg-adm-success-bg" aria-hidden />{t("table.legendComplete")}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-xs bg-adm-fill/15" aria-hidden />{t("table.legendDraft")}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-xs bg-adm-danger-bg" aria-hidden />{t("table.legendMissing")}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-adm-line bg-adm-text/4">
                <th className="admin-th">{t("table.columnItem")}</th>
                <th className="admin-th">{t("table.columnType")}</th>
                <th className="admin-th text-center">ไทย</th>
                <th className="admin-th text-center">English</th>
                <th className="admin-th text-center">中文</th>
                <th className="admin-th text-center">Русский</th>
                <th className="admin-th">{t("table.columnStatus")}</th>
                <th className="admin-th" />
              </tr>
            </thead>
            <tbody>
              {overview.allRows.map((row) => (
                <tr key={`${row.type}-${row.id}`} className="border-b border-adm-line last:border-0">
                  <td className="admin-td font-medium text-adm-text">{row.title}</td>
                  <td className="admin-td text-adm-muted">{tRoot(`nav.${typeLabelKey(row.type)}` as never)}</td>
                  {/* Three states, which is what the legend above has
                      always claimed: written-and-live, written-but-not-
                      published-yet, and absent. */}
                  {row.localeStates.map((entry) => (
                    <td key={entry.locale} className="admin-td text-center">
                      <span
                        className={`inline-flex h-5 min-w-6 items-center justify-center rounded-xs px-1 text-[11px] font-bold ${LOCALE_STATE_TONE[entry.state]}`}
                        title={t(`table.legend${entry.state === "live" ? "Complete" : entry.state === "draft" ? "Draft" : "Missing"}` as never)}
                      >
                        {entry.state === "live" ? "✓" : entry.state === "draft" ? t("table.legendDraft") : "—"}
                      </span>
                    </td>
                  ))}
                  <td className="admin-td">{statusChip(row)}</td>
                  <td className="admin-td text-right">
                    <Link
                      href={`/${locale}/admin/${EDIT_PATH[row.type]}/${row.id}/edit`}
                      className="text-xs font-medium text-adm-accent-ink hover:text-adm-accent-ink"
                    >
                      {tRoot("common.edit")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
