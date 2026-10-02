/**
 * components/admin/NewsCards.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Articles as photo cards — the v4 default for the news list. The cover
 * is how an editor recognises a piece, and the three numbers that decide
 * what to do with it next (its SEO score, its views, the leads it brought)
 * fit under it. Bulk publish and delete stay in the table (?view=table).
 *
 * The SEO ring reads NewsArticle.seoScore, the score stored at the last
 * save — the same number NewsSeoPanel shows, not a re-run of the checklist
 * per card. An article saved before scoring existed shows no ring rather
 * than a zero it never earned.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import type { ArticleRow, LocaleState } from "@/lib/admin/news-list";
import ProgressRing from "@/components/admin/ui/ProgressRing";
import AdminImage from "@/components/admin/ui/AdminImage";

const STATUS_TONE: Record<ArticleRow["status"], string> = {
  published: "bg-adm-success-bg text-adm-success",
  scheduled: "bg-adm-status-info-bg text-adm-status-info",
  inReview: "bg-adm-warning-bg text-adm-warning",
  draft: "bg-adm-neutral-bg text-adm-neutral",
};

const LOCALE_TONE: Record<LocaleState, string> = {
  done: "bg-adm-success-bg text-adm-success",
  partial: "bg-adm-warning-bg text-adm-warning",
  missing: "bg-adm-danger-bg text-adm-danger",
};

export default function NewsCards({
  locale,
  rows,
  localeCodes,
  labels,
}: {
  locale: string;
  rows: ArticleRow[];
  localeCodes: string[];
  labels: {
    status: Record<ArticleRow["status"], string>;
    noCategory: string;
    seo: string;
    seoNone: string;
    views: string;
    leads: string;
    empty: string;
  };
}) {
  if (rows.length === 0) {
    return <div className="admin-card text-center text-sm text-ink-muted">{labels.empty}</div>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/${locale}/admin/news/${row.id}/edit`}
            className="admin-card group block h-full overflow-hidden p-0! transition-[transform,border-color] hover:-translate-y-0.5 hover:border-adm-line-strong motion-reduce:hover:translate-y-0"
          >
            <span className="relative block aspect-[16/9] bg-surface-muted">
              <AdminImage src={row.coverImageUrl} loading="lazy" iconSize={26} className="h-full w-full object-cover" />
              <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-adm-solid px-2.5 py-0.5 text-[11px] font-medium text-ink">
                  {row.category ?? labels.noCategory}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[row.status]}`}>
                  {labels.status[row.status]}
                </span>
              </span>
            </span>

            <span className="block p-4">
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-primary-500">
                {row.title}
              </span>

              <span className="mt-3 flex items-center gap-3 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5" title={labels.seo}>
                  {row.seoScore === null ? (
                    <span>{labels.seoNone}</span>
                  ) : (
                    <ProgressRing value={row.seoScore} size="sm" label={`${labels.seo} ${row.seoScore}`} />
                  )}
                </span>
                <span className="tabular-nums">
                  {row.views30} {labels.views}
                </span>
                <span className={`tabular-nums ${row.leads > 0 ? "font-semibold text-adm-success" : ""}`}>
                  {row.leads} {labels.leads}
                </span>
              </span>

              <span className="mt-3 flex gap-1">
                {localeCodes.map((code) => (
                  <span
                    key={code}
                    className={`rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${LOCALE_TONE[row.localeStates[code as keyof typeof row.localeStates]]}`}
                  >
                    {code}
                  </span>
                ))}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
