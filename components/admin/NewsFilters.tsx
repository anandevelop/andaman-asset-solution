"use client";

/**
 * components/admin/NewsFilters.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Search, the three dropdowns, the "translations incomplete" chip and the
 * sort control for the article index (News.dc.html).
 *
 * Written into the query string, like ProjectFilters and LeadFilters: the
 * view is then linkable, survives a refresh, and is what the bulk actions
 * are acting on when somebody selects everything on screen.
 *
 * Every filter resets `page` — landing on page 3 of a result set that now
 * has one page shows an empty table and no explanation for it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

type Props = {
  locale: string;
  activeSearch: string;
  activeCategory: string;
  activeStatus: string;
  activeAuthor: string;
  activeSort: string;
  incompleteOnly: boolean;
  incompleteCount: number;
  categories: string[];
  authors: { id: string; name: string }[];
  labels: {
    searchPlaceholder: string;
    category: string;
    status: string;
    author: string;
    all: string;
    everyone: string;
    statusPublished: string;
    statusInReview: string;
    statusScheduled: string;
    statusDraft: string;
    /** Already formatted with the count — the number is known on the
     *  server that rendered it, so nothing is interpolated here. */
    incomplete: string;
    clearFilter: string;
    sort: string;
    sortViews: string;
    sortLeads: string;
    sortRecent: string;
    sortTitle: string;
  };
};

/** Long enough that typing a headline is one navigation, short enough that
 *  the table still feels like it is answering you. */
const SEARCH_DEBOUNCE_MS = 300;

export default function NewsFilters({
  locale,
  activeSearch,
  activeCategory,
  activeStatus,
  activeAuthor,
  activeSort,
  incompleteOnly,
  incompleteCount,
  categories,
  authors,
  labels,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const [search, setSearch] = useState(activeSearch);
  const [pending, setPending] = useState(false);

  /*
    Held in a ref so the debounce timer below always fires the newest
    version — capturing `push` in that effect instead would either navigate
    with a stale query string or make the effect re-run (and restart the
    timer) on every keystroke's re-render. Same shape as ProjectFilters
    next door, for the same reason.
  */
  const push = useRef<(changes: Record<string, string | null>) => void>(() => undefined);
  // eslint-disable-next-line react-hooks/refs -- the latest-ref idiom: the debounce below must call the newest closure, and an effect-assigned ref would hand it a stale query string.
  push.current = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === "ALL") next.delete(key);
      else next.set(key, value);
    }

    // Any change to what is being looked at starts again at the first page.
    next.delete("page");

    const query = next.toString();
    router.replace(`/${locale}/admin/news${query ? `?${query}` : ""}`, { scroll: false });
  };

  // Keep the box in step when the URL changes underneath it — the back
  // button, or the chip below clearing a filter.
  useEffect(() => {
    setSearch(activeSearch);
  }, [activeSearch]);

  // The spinner stops when the server has answered with this search.
  useEffect(() => {
    setPending(false);
  }, [activeSearch, activeCategory, activeStatus, activeAuthor, activeSort, incompleteOnly]);

  useEffect(() => {
    if (search === activeSearch) return;

    setPending(true);
    const timer = setTimeout(() => push.current({ q: search }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, activeSearch]);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="admin-input py-2! pl-9 pr-8 text-sm"
        />
        {pending && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-muted"
            aria-hidden
          />
        )}
      </div>

      <label className="sr-only" htmlFor="news-category">
        {labels.category}
      </label>
      <select
        id="news-category"
        value={activeCategory}
        onChange={(event) => push.current({ category: event.target.value })}
        className="admin-input w-auto! py-2! text-sm"
      >
        <option value="ALL">
          {labels.category}: {labels.all}
        </option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="news-status">
        {labels.status}
      </label>
      <select
        id="news-status"
        value={activeStatus}
        onChange={(event) => push.current({ status: event.target.value })}
        className="admin-input w-auto! py-2! text-sm"
      >
        <option value="ALL">
          {labels.status}: {labels.all}
        </option>
        <option value="published">{labels.statusPublished}</option>
        <option value="inReview">{labels.statusInReview}</option>
        <option value="scheduled">{labels.statusScheduled}</option>
        <option value="draft">{labels.statusDraft}</option>
      </select>

      <label className="sr-only" htmlFor="news-author">
        {labels.author}
      </label>
      <select
        id="news-author"
        value={activeAuthor}
        onChange={(event) => push.current({ author: event.target.value })}
        className="admin-input w-auto! py-2! text-sm"
      >
        <option value="ALL">
          {labels.author}: {labels.everyone}
        </option>
        {authors.map((author) => (
          <option key={author.id} value={author.id}>
            {author.name}
          </option>
        ))}
      </select>

      {/* Only offered when there is something to filter to. A chip reading
          "incomplete 0" is a control that does nothing. */}
      {incompleteCount > 0 && (
        <button
          type="button"
          onClick={() => push.current({ incomplete: incompleteOnly ? null : "1" })}
          aria-pressed={incompleteOnly}
          className={[
            "flex items-center gap-2 rounded-xs border px-3 py-2 text-sm transition-colors",
            incompleteOnly
              ? "border-amber-300 bg-amber-50 font-medium text-amber-900"
              : "border-primary/15 text-ink-muted hover:text-primary",
          ].join(" ")}
        >
          {labels.incomplete}
          {incompleteOnly && <X size={13} aria-label={labels.clearFilter} />}
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <label className="text-sm text-ink-muted" htmlFor="news-sort">
          {labels.sort}
        </label>
        <select
          id="news-sort"
          value={activeSort}
          onChange={(event) => push.current({ sort: event.target.value })}
          className="admin-input w-auto! py-2! text-sm"
        >
          <option value="views">{labels.sortViews}</option>
          <option value="leads">{labels.sortLeads}</option>
          <option value="recent">{labels.sortRecent}</option>
          <option value="title">{labels.sortTitle}</option>
        </select>
      </div>
    </div>
  );
}
