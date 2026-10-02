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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FilterChip from "@/components/admin/ui/FilterChip";
import Segmented from "@/components/admin/ui/Segmented";
import { ArrowDownUp, Languages, Loader2, Search, Tag, UserRound } from "lucide-react";

type Props = {
  locale: string;
  activeSearch: string;
  activeCategory: string;
  activeStatus: string;
  statusCounts: Record<"all" | "draft" | "inReview" | "scheduled" | "published", number>;
  /** After the search — the cards/table switch. */
  trailing?: ReactNode;
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
  statusCounts,
  trailing,
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

  /* Search, then the filters as chips (FilterChip): dashed until they
     narrow something. Same URL parameters as the <select>s they replace. */
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status as segments, with counts (v4): the four states are the
          first thing anyone narrows by, and a chip hid the numbers. */}
      <Segmented
        label={labels.status}
        active={activeStatus === "ALL" ? "ALL" : activeStatus}
        onSelect={(value) => push.current({ status: value === "ALL" ? null : value })}
        items={[
          { key: "ALL", label: labels.all, count: statusCounts.all },
          { key: "draft", label: labels.statusDraft, count: statusCounts.draft },
          { key: "inReview", label: labels.statusInReview, count: statusCounts.inReview },
          ...(statusCounts.scheduled > 0
            ? [{ key: "scheduled", label: labels.statusScheduled, count: statusCounts.scheduled }]
            : []),
          { key: "published", label: labels.statusPublished, count: statusCounts.published },
        ]}
      />

      <FilterChip
        label={labels.category}
        icon={Tag}
        options={categories.map((category) => ({ value: category, label: category }))}
        value={activeCategory === "ALL" ? null : activeCategory}
        onSelect={(value) => push.current({ category: value })}
        onClear={() => push.current({ category: null })}
        clearLabel={labels.clearFilter}
      />
      <FilterChip
        label={labels.author}
        icon={UserRound}
        options={authors.map((author) => ({ value: author.id, label: author.name }))}
        value={activeAuthor === "ALL" ? null : activeAuthor}
        onSelect={(value) => push.current({ author: value })}
        onClear={() => push.current({ author: null })}
        clearLabel={labels.clearFilter}
      />
      {/* Only offered when there is something to filter to. A chip reading
          "incomplete 0" is a control that does nothing. */}
      {incompleteCount > 0 && (
        <FilterChip
          label={labels.incomplete}
          icon={Languages}
          options={[{ value: "1", label: labels.incomplete }]}
          value={incompleteOnly ? "1" : null}
          onSelect={() => push.current({ incomplete: "1" })}
          onClear={() => push.current({ incomplete: null })}
          clearLabel={labels.clearFilter}
        />
      )}
      {/* Views is the default order, so the chip is "off" there. */}
      <FilterChip
        label={labels.sort}
        icon={ArrowDownUp}
        options={[
          { value: "leads", label: labels.sortLeads },
          { value: "recent", label: labels.sortRecent },
          { value: "title", label: labels.sortTitle },
        ]}
        value={activeSort === "views" ? null : activeSort}
        onSelect={(value) => push.current({ sort: value })}
        onClear={() => push.current({ sort: null })}
        clearLabel={labels.clearFilter}
      />

      <div className="relative ml-auto min-w-[220px] sm:w-64">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-adm-muted"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="admin-input h-8 pl-9! pr-8!"
        />
        {pending && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-adm-muted"
            aria-hidden
          />
        )}
      </div>

      {trailing}
    </div>
  );
}
