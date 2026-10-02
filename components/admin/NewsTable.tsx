"use client";

/**
 * components/admin/NewsTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The article table (News.dc.html), with selection and the bulk bar.
 *
 * TWO NUMBERS, ONE OF THEM THE POINT
 *
 * "Views in 30 days" and "leads from this article" sit next to each other
 * because neither means much alone, and the leads column is the one that
 * answers the question an editor actually has. It is emphasised — a real
 * count in green, a dash when nothing has happened rather than a zero,
 * because a zero next to four thousand views is a finding and should read
 * like one, while a dash on an unpublished draft is simply "not yet".
 *
 * Selection exists because there are real bulk actions behind it —
 * publish, unpublish, delete. A checkbox column with nothing behind it
 * would be furniture.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, Eye, EyeOff, Loader2, Pencil, Trash2 } from "lucide-react";
import type { ArticleRow, LocaleState } from "@/lib/admin/news-list";
import { bulkSetPublished, bulkDeleteArticles } from "@/app/[locale]/admin/(content)/news/actions";
import AdminImage from "@/components/admin/ui/AdminImage";

type Props = {
  locale: string;
  rows: ArticleRow[];
  localeCodes: string[];
  labels: {
    selectAll: string;
    selectRow: string;
    article: string;
    category: string;
    author: string;
    languages: string;
    status: string;
    views: string;
    leads: string;
    publishedAt: string;
    edit: string;
    view: string;
    none: string;
    noUrlYet: string;
    /** "edited 12 days ago" — formatted by the caller for each row. */
    updatedPrefix: string;
    reviewNote: string;
    statusPublished: string;
    statusInReview: string;
    statusScheduled: string;
    statusDraft: string;
    empty: string;
    publish: string;
    unpublish: string;
    delete: string;
    clearSelection: string;
    goToPublishing: string;
    error: string;
  };
  /** Pre-formatted per row, so no date or plural is built on the client. */
  rowMeta: Record<string, { published: string | null; edited: string }>;
};

const STATE_STYLE: Record<LocaleState, string> = {
  done: "bg-adm-strong text-adm-on-strong",
  // Amber, not red: a half-done translation is work in progress, and the
  // list is also how a translator finds what to pick up next.
  partial: "bg-adm-warning-bg text-adm-warning",
  missing: "bg-adm-text/4 text-adm-muted/70",
};

export default function NewsTable({ locale, rows, localeCodes, labels, rowMeta }: Props) {
  const router = useRouter();
  /* The two strings whose number is not known until somebody has ticked
     something. Every other label on this screen is formatted on the
     server, where the number already exists. */
  const t = useTranslations("admin");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = (action: () => Promise<{ ok: boolean; changed: number; blocked: number }>) => {
    setError(false);
    setNotice(null);

    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(true);
        return;
      }

      /*
        Said out loud, because the publishing gate can refuse silently:
        an article that has not been through review cannot be put on the
        site from here, and pressing Publish and seeing nothing move is
        indistinguishable from a broken button.
      */
      if (result.blocked > 0) {
        setNotice(t("news.bulkBlocked", { count: result.blocked }));
      }

      setSelected(new Set());
      router.refresh();
    });
  };

  const ids = useMemo(() => [...selected], [selected]);

  const statusLabel: Record<ArticleRow["status"], string> = {
    published: labels.statusPublished,
    inReview: labels.statusInReview,
    scheduled: labels.statusScheduled,
    draft: labels.statusDraft,
  };

  const statusStyle: Record<ArticleRow["status"], string> = {
    published: "bg-adm-success-bg text-adm-success",
    inReview: "bg-adm-warning-bg text-adm-warning",
    scheduled: "bg-adm-fill/15 text-adm-accent-ink",
    draft: "bg-adm-text/4 text-adm-muted",
  };

  if (rows.length === 0) {
    return <div className="admin-card text-center text-sm text-adm-muted">{labels.empty}</div>;
  }

  return (
    <div className="space-y-3">
      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xs border border-adm-line-strong bg-primary/3 px-4 py-2.5 text-sm">
          <span className="font-medium text-adm-text">
            {t("news.selectedCount", { count: ids.length })}
          </span>

          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => bulkSetPublished(locale, ids, true))}
            className="admin-btn-ghost py-1.5! text-xs"
          >
            <Eye size={13} aria-hidden />
            {labels.publish}
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => bulkSetPublished(locale, ids, false))}
            className="admin-btn-ghost py-1.5! text-xs"
          >
            <EyeOff size={13} aria-hidden />
            {labels.unpublish}
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(t("news.confirmBulkDelete", { count: ids.length }))) {
                run(() => bulkDeleteArticles(locale, ids));
              }
            }}
            className="admin-btn-ghost py-1.5! text-xs text-adm-danger"
          >
            <Trash2 size={13} aria-hidden />
            {labels.delete}
          </button>

          {pending && <Loader2 size={14} className="animate-spin text-adm-muted" aria-hidden />}

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-adm-muted underline hover:text-adm-text"
          >
            {labels.clearSelection}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xs border border-adm-danger/30 bg-adm-danger-bg px-4 py-3 text-sm text-adm-danger">
          {labels.error}
        </p>
      )}

      {notice && (
        <p className="flex flex-wrap items-center gap-2 rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          <AlertTriangle size={15} aria-hidden />
          {notice}
          <Link
            href={`/${locale}/admin/publishing`}
            className="font-medium underline hover:no-underline"
          >
            {labels.goToPublishing}
          </Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-card border border-adm-line bg-adm-solid">
        <table className="w-full min-w-[1000px] table-fixed border-collapse">
          <thead className="border-b border-adm-line bg-adm-text/4">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  aria-label={labels.selectAll}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))
                  }
                  className="h-4 w-4 rounded-xs border-adm-line-strong"
                />
              </th>
              {/* Explicit widths, because the two number columns on the
                  right are the reason this screen exists and must never be
                  the ones a long headline pushes off the edge. */}
              <th className="admin-th w-[300px]">{labels.article}</th>
              <th className="admin-th w-[108px]">{labels.category}</th>
              <th className="admin-th w-[108px]">{labels.author}</th>
              <th className="admin-th w-[132px]">{labels.languages}</th>
              <th className="admin-th w-[116px]">{labels.status}</th>
              <th className="admin-th w-[86px] px-3! text-right!">{labels.views}</th>
              <th className="admin-th w-[86px] px-3! text-right!">{labels.leads}</th>
              <th className="admin-th w-[64px]" />
            </tr>
          </thead>

          <tbody className="divide-y divide-adm-line">
            {rows.map((row) => {
              const meta = rowMeta[row.id];
              const live = row.status === "published";

              return (
                <tr
                  key={row.id}
                  className={[
                    "transition-colors hover:bg-adm-text/4",
                    row.status === "inReview" ? "bg-amber-50/40" : "",
                    selected.has(row.id) ? "bg-primary/4" : "",
                  ].join(" ")}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      aria-label={`${labels.selectRow}: ${row.title}`}
                      onChange={() => toggle(row.id)}
                      className="h-4 w-4 rounded-xs border-adm-line-strong"
                    />
                  </td>

                  <td className="admin-td">
                    <div className="flex items-center gap-3">
                      <AdminImage
                        src={row.coverImageUrl}
                        iconSize={15}
                        className="h-11 w-16 shrink-0 rounded-xs bg-adm-text/4 object-cover"
                      />

                      {/* Capped and truncated: an untruncated slug pushes
                          the two number columns off the right-hand edge,
                          which are the columns this screen is for. */}
                      <div className="min-w-0">
                        <Link
                          href={`/${locale}/admin/news/${row.id}/edit`}
                          title={row.title}
                          className="block truncate font-medium text-adm-text hover:underline"
                        >
                          {row.title}
                        </Link>
                        <p className="mt-0.5 truncate font-mono text-xs text-adm-muted">
                          {live || row.status === "scheduled" ? (
                            <>/news/{row.slug}</>
                          ) : (
                            <span className="font-sans">
                              {labels.noUrlYet} · {labels.updatedPrefix} {meta?.edited}
                            </span>
                          )}
                          {row.status === "inReview" && (
                            <span className="font-sans"> · {labels.reviewNote}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="admin-td text-adm-muted">
                    <span className="block truncate">{row.category ?? labels.none}</span>
                  </td>

                  <td className="admin-td text-adm-muted">
                    <span className="block truncate">{row.authorName ?? labels.none}</span>
                  </td>

                  <td className="admin-td">
                    <span className="inline-flex items-center gap-1">
                      {localeCodes.map((code) => (
                        <span
                          key={code}
                          title={code.toUpperCase()}
                          className={[
                            "inline-flex h-5 min-w-[26px] items-center justify-center rounded-xs px-1 text-[10px] font-semibold",
                            STATE_STYLE[row.localeStates[code as keyof typeof row.localeStates]],
                          ].join(" ")}
                        >
                          {code.toUpperCase()}
                        </span>
                      ))}
                    </span>
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-xs px-2 py-1 text-xs font-medium ${statusStyle[row.status]}`}
                    >
                      {row.status === "scheduled" && <CalendarClock size={12} aria-hidden />}
                      {statusLabel[row.status]}
                    </span>
                    {meta?.published && (
                      <p className="mt-1 text-xs text-adm-muted" title={labels.publishedAt}>
                        {meta.published}
                      </p>
                    )}
                  </td>

                  {/* Views and leads are only meaningful for a page that
                      exists. A draft shows a dash, not a zero — zero says
                      "nobody read it", and nobody could have. */}
                  <td className="admin-td px-3! whitespace-nowrap text-right tabular-nums">
                    {live ? row.views30.toLocaleString() : <span className="text-adm-muted">—</span>}
                  </td>

                  <td className="admin-td px-3! whitespace-nowrap text-right tabular-nums">
                    {live ? (
                      <span
                        className={
                          row.leads > 0 ? "font-semibold text-adm-success" : "text-adm-muted"
                        }
                      >
                        {row.leads}
                      </span>
                    ) : (
                      <span className="text-adm-muted">—</span>
                    )}
                  </td>

                  <td className="admin-td whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      {live && (
                        <Link
                          href={`/${locale}/news/${row.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-adm-muted hover:text-adm-text"
                          title={labels.view}
                        >
                          <Eye size={15} aria-hidden />
                        </Link>
                      )}
                      <Link
                        href={`/${locale}/admin/news/${row.id}/edit`}
                        title={labels.edit}
                        aria-label={`${labels.edit}: ${row.title}`}
                        className="text-adm-accent-ink hover:text-adm-accent-ink"
                      >
                        <Pencil size={15} aria-hidden />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
