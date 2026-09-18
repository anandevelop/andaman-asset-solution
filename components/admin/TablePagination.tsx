"use client";

/**
 * components/admin/TablePagination.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Showing 1–25 of 84" plus the page-size select and page buttons, for the
 * admin list pages (Projects.dc.html's footer is the first user).
 *
 * Page state lives in the query string like every other filter on those
 * pages, so a link to page 3 of a filtered list is a link to what the
 * sender was actually looking at. `perPage` resets to page 1 — showing 100
 * per page while sitting on page 4 of a 25-per-page result would land on
 * a page that no longer exists.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  basePath: string;
  page: number;
  pageCount: number;
  perPage: number;
  /** Page-size choices, each with its label already formatted — the set is
   *  fixed, so nothing here has to be interpolated on the client. */
  perPageOptions: readonly { value: number; label: string }[];
  labels: {
    /** "Showing 1–25 of 84", formatted by the server that counted them. */
    showing: string;
    perPageAria: string;
    previous: string;
    next: string;
    page: string;
  };
};

/**
 * Which page numbers to draw. Everything up to seven pages is shown in
 * full; past that it collapses to first / a window around the current /
 * last, with nulls standing in for the gaps.
 */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set<number>([1, pageCount, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < pageCount) pages.add(page + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const output: (number | null)[] = [];

  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) output.push(null);
    output.push(value);
  }

  return output;
}

export default function TablePagination({
  basePath,
  page,
  pageCount,
  perPage,
  perPageOptions,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === "") params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    startTransition(() => router.replace(`${basePath}${query ? `?${query}` : ""}`));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">{labels.showing}</p>

      <div className="flex items-center gap-2">
        <select
          aria-label={labels.perPageAria}
          value={perPage}
          onChange={(event) => go({ perPage: event.target.value, page: "" })}
          disabled={pending}
          className="admin-input w-auto! py-1.5! text-xs"
        >
          {perPageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <nav className="flex items-center gap-1" aria-label={labels.page}>
          <button
            type="button"
            onClick={() => go({ page: String(page - 1) })}
            disabled={pending || page <= 1}
            aria-label={labels.previous}
            className="rounded-xs border border-primary/15 p-1.5 text-ink-muted transition-colors hover:text-primary disabled:opacity-40"
          >
            <ChevronLeft size={15} aria-hidden />
          </button>

          {pageWindow(page, pageCount).map((value, index) =>
            value === null ? (
              <span key={`gap-${index}`} className="px-1 text-xs text-ink-muted" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={value}
                type="button"
                onClick={() => go({ page: value === 1 ? "" : String(value) })}
                disabled={pending}
                aria-current={value === page ? "page" : undefined}
                aria-label={`${labels.page} ${value}`}
                className={[
                  "min-w-[30px] rounded-xs border px-2 py-1.5 text-xs font-medium tabular-nums transition-colors",
                  value === page
                    ? "border-primary bg-primary text-white"
                    : "border-primary/15 text-ink-muted hover:text-primary",
                ].join(" ")}
              >
                {value}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => go({ page: String(page + 1) })}
            disabled={pending || page >= pageCount}
            aria-label={labels.next}
            className="rounded-xs border border-primary/15 p-1.5 text-ink-muted transition-colors hover:text-primary disabled:opacity-40"
          >
            <ChevronRight size={15} aria-hidden />
          </button>
        </nav>
      </div>
    </div>
  );
}
