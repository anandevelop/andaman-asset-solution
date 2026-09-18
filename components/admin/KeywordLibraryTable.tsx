"use client";

/**
 * components/admin/KeywordLibraryTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The keyword library's main table — client-side search/sort over the
 * server-provided rows (lib/admin/keyword-library.ts), same "no client
 * fetching, filter what the server already sent" shape as UnitsPanel's
 * own row table.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import KeywordSparkline from "@/components/admin/KeywordSparkline";
import type { KeywordRow } from "@/lib/admin/keyword-library";
import type { ResolvedContentRef } from "@/lib/admin/content-link-index";

const ADMIN_EDIT_HREF: Record<ResolvedContentRef["contentType"], (id: string) => string> = {
  PROJECT: (id) => `/admin/projects/${id}/edit`,
  NEWS_ARTICLE: (id) => `/admin/news/${id}/edit`,
  EVENT: (id) => `/admin/events/${id}/edit`,
};

type Labels = {
  searchPlaceholder: string;
  keyword: string;
  locale: string;
  searchVolume: string;
  difficulty: string;
  rank: string;
  change: string;
  matchedPages: string;
  trend: string;
  noValue: string;
  noPages: string;
  primaryBadge: string;
};

function changeDisplay(change: number | null): { text: string; className: string } {
  if (change === null) return { text: "—", className: "text-ink-muted" };
  if (change > 0) return { text: `▲ ${change}`, className: "text-emerald-700" };
  if (change < 0) return { text: `▼ ${Math.abs(change)}`, className: "text-red-700" };
  return { text: "–", className: "text-ink-muted" };
}

export default function KeywordLibraryTable({ rows, locale, labels }: { rows: KeywordRow[]; locale: string; labels: Labels }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.phrase.toLowerCase().includes(needle));
  }, [rows, query]);

  return (
    <section className="admin-card overflow-hidden p-0!">
      <div className="flex items-center gap-2 border-b border-primary/10 px-5 py-3.5">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-2.5 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchPlaceholder}
            className="admin-input w-56! py-1.5! pl-8! text-xs"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-primary/10 bg-surface-muted">
              <th className="admin-th">{labels.keyword}</th>
              <th className="admin-th">{labels.locale}</th>
              <th className="admin-th">{labels.searchVolume}</th>
              <th className="admin-th">{labels.difficulty}</th>
              <th className="admin-th">{labels.rank}</th>
              <th className="admin-th">{labels.change}</th>
              <th className="admin-th">{labels.matchedPages}</th>
              <th className="admin-th">{labels.trend}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const change = changeDisplay(row.change);
              return (
                <tr key={row.id} className="border-b border-primary/5 text-sm last:border-b-0">
                  <td className="admin-td font-medium text-ink">{row.phrase}</td>
                  <td className="admin-td uppercase text-ink-muted">{row.locale}</td>
                  <td className="admin-td tabular-nums">{row.searchVolume ?? labels.noValue}</td>
                  <td className="admin-td tabular-nums">{row.difficulty ?? labels.noValue}</td>
                  <td className="admin-td tabular-nums">{row.currentRank ?? labels.noValue}</td>
                  <td className={`admin-td tabular-nums font-medium ${change.className}`}>{change.text}</td>
                  <td className="admin-td">
                    {row.matchedPages.length === 0 ? (
                      <span className="text-ink-muted">{labels.noPages}</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {row.matchedPages.map((page) => (
                          <li key={`${page.contentType}:${page.contentId}:${page.locale}`}>
                            <Link
                              href={`/${locale}${ADMIN_EDIT_HREF[page.contentType](page.contentId)}`}
                              className="text-accent-700 hover:underline"
                            >
                              {page.title}
                            </Link>
                            {page.isPrimary && (
                              <span className="ml-1 rounded-xs bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
                                {labels.primaryBadge}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="admin-td">
                    <KeywordSparkline points={row.trend} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
