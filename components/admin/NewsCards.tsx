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
import { intlLocale } from "@/lib/format";
import type { ArticleRow, LocaleState } from "@/lib/admin/news-list";
import ProgressRing from "@/components/admin/ui/ProgressRing";
import AdminImage from "@/components/admin/ui/AdminImage";
import LocaleFlags from "@/components/admin/ui/LocaleFlags";

const STATUS_TONE: Record<ArticleRow["status"], string> = {
  published: "bg-adm-success-bg text-adm-success",
  scheduled: "bg-adm-status-info-bg text-adm-status-info",
  inReview: "bg-adm-warning-bg text-adm-warning",
  draft: "bg-adm-neutral-bg text-adm-neutral",
};

const FLAG_STATE: Record<LocaleState, "complete" | "partial" | "missing"> = {
  done: "complete",
  partial: "partial",
  missing: "missing",
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
    return <div className="admin-card text-center text-sm text-adm-muted">{labels.empty}</div>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/${locale}/admin/news/${row.id}/edit`}
            data-spot
            className="admin-card admin-card-lift group flex h-full flex-col overflow-hidden p-0!"
          >
            <span className="relative block h-[150px]">
              <AdminImage src={row.coverImageUrl} loading="lazy" iconSize={26} className="h-full w-full object-cover" />
              <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                {row.category && (
                  <span className="rounded-full bg-adm-solid px-2.5 py-0.5 text-[11px] font-medium text-adm-text shadow-[0_1px_4px_rgba(0,0,0,0.12)]">
                    {row.category}
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[row.status]}`}>
                  {labels.status[row.status]}
                </span>
              </span>
            </span>

            <span className="flex flex-1 flex-col p-4">
              <span className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] font-semibold leading-[1.4] text-adm-text">{row.title}</span>
                  {row.subtitle && <span className="mt-0.5 block truncate text-xs text-adm-muted">{row.subtitle}</span>}
                </span>
                <span className="shrink-0" title={row.seoScore === null ? labels.seoNone : labels.seo}>
                  {row.seoScore === null ? (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-adm-line-strong text-[10px] text-adm-muted">
                      SEO
                    </span>
                  ) : (
                    <ProgressRing value={row.seoScore} label={`${labels.seo} ${row.seoScore}`} />
                  )}
                </span>
              </span>

              <span className="mt-auto flex items-center justify-between gap-3 pt-3">
                <span className="flex items-center gap-3 text-xs text-adm-muted">
                  {row.publishedAt && (
                    <time dateTime={row.publishedAt}>
                      {new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric" }).format(
                        new Date(row.publishedAt),
                      )}
                    </time>
                  )}
                  <span className="tabular-nums">
                    {row.views30} {labels.views}
                  </span>
                  <span className={`tabular-nums ${row.leads > 0 ? "font-semibold text-adm-success" : ""}`}>
                    {row.leads} {labels.leads}
                  </span>
                </span>
                <LocaleFlags
                  locales={localeCodes.map((code) => ({
                    locale: code,
                    state: FLAG_STATE[row.localeStates[code as keyof typeof row.localeStates]],
                  }))}
                />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
