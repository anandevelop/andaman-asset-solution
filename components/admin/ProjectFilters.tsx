"use client";

/**
 * components/admin/ProjectFilters.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Search, the three dropdowns, the "languages incomplete" chip and the
 * sort control for the admin Projects index (Projects.dc.html).
 *
 * Written straight into the query string, like LeadFilters next door: the
 * current view is then linkable, survives a refresh, and is the same thing
 * the CSV export reads to decide what "export what I am looking at" means.
 *
 * Every filter resets `page` — landing on page 3 of a result set that now
 * has one page shows an empty table and no explanation for it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectStatus, PropertyType } from "@prisma/client";
import FilterChip from "@/components/admin/ui/FilterChip";
import { ArrowDownUp, CircleDot, Globe, Home, Languages, Loader2, Search } from "lucide-react";

type Props = {
  locale: string;
  activeSearch: string;
  activeType: string;
  activeStatus: string;
  activePublished: string;
  activeSort: string;
  incompleteOnly: boolean;
  incompleteCount: number;
  resultCount: number;
  typeLabels: Record<PropertyType, string>;
  statusLabels: Record<ProjectStatus, string>;
  labels: {
    searchPlaceholder: string;
    /** Already formatted ("24 found") — the number comes from the same
     *  server render as the rows, so there is nothing to interpolate here
     *  and no ICU plural to get wrong on the client. */
    resultCount: string;
    type: string;
    status: string;
    published: string;
    all: string;
    publishedOnly: string;
    draftOnly: string;
    incomplete: string;
    sort: string;
    sortCustom: string;
    sortRecent: string;
    sortName: string;
    sortUnitsLeft: string;
    /** The ✕ on an active chip. */
    clearFilter: string;
  };
};

/** Long enough that typing a project name is one navigation, short enough
 *  that the count under the box still feels like it is answering you. */
const SEARCH_DEBOUNCE_MS = 300;

export default function ProjectFilters({
  locale,
  activeSearch,
  activeType,
  activeStatus,
  activePublished,
  activeSort,
  incompleteOnly,
  incompleteCount,
  resultCount,
  typeLabels,
  statusLabels,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState(activeSearch);

  // The URL is the source of truth: a back/forward navigation, or the
  // "clear" button below, has to be reflected in the box.
  useEffect(() => {
    setSearch(activeSearch);
  }, [activeSearch]);

  /*
    Held in a ref so the debounce timer below always fires the newest
    version — capturing `push` in that effect instead would either navigate
    with a stale query string or make the effect re-run (and restart the
    timer) on every keystroke's re-render.
  */
  const push = useRef<(updates: Record<string, string>) => void>(() => undefined);
  // eslint-disable-next-line react-hooks/refs -- the latest-ref idiom: the debounce below must call the newest closure, and an effect-assigned ref would hand it a stale query string.
  push.current = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      // Defaults stay out of the URL so a bare /admin/projects stays bare.
      if (value === "" || value === "ALL" || value === "false" || value === "custom") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    // Any change to what is being filtered invalidates the page number.
    if (!("page" in updates)) params.delete("page");

    const query = params.toString();
    setPending(true);
    router.replace(`/${locale}/admin/projects${query ? `?${query}` : ""}`);
  };

  // Navigation finished once the server sent back the props we are
  // rendering; clearing the spinner here rather than in a transition keeps
  // it honest for the debounced search too.
  useEffect(() => {
    setPending(false);
  }, [activeSearch, activeType, activeStatus, activePublished, activeSort, incompleteOnly, resultCount]);

  useEffect(() => {
    if (search === activeSearch) return;
    const timer = setTimeout(() => push.current({ q: search }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, activeSearch]);

  /* Search, then the filters as chips (FilterChip): dashed while they
     filter nothing, sand with an ✕ once they do. Each writes the same URL
     parameter its <select> did — see push above. */
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex min-w-[240px] flex-1 items-center sm:max-w-sm">
        <Search size={15} className="absolute left-3 text-adm-muted" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="admin-input h-8 pl-9! pr-24!"
        />
        <span className="pointer-events-none absolute right-3 border-l border-adm-line pl-3 text-xs text-adm-muted">
          {labels.resultCount}
        </span>
      </div>

      <FilterChip
        label={labels.type}
        icon={Home}
        options={Object.values(PropertyType).map((type) => ({ value: type, label: typeLabels[type] }))}
        value={activeType === "ALL" ? null : activeType}
        onSelect={(value) => push.current({ type: value })}
        onClear={() => push.current({ type: "ALL" })}
        clearLabel={labels.clearFilter}
      />
      <FilterChip
        label={labels.status}
        icon={CircleDot}
        options={Object.values(ProjectStatus).map((status) => ({ value: status, label: statusLabels[status] }))}
        value={activeStatus === "ALL" ? null : activeStatus}
        onSelect={(value) => push.current({ status: value })}
        onClear={() => push.current({ status: "ALL" })}
        clearLabel={labels.clearFilter}
      />
      <FilterChip
        label={labels.published}
        icon={Globe}
        options={[
          { value: "PUBLISHED", label: labels.publishedOnly },
          { value: "DRAFT", label: labels.draftOnly },
        ]}
        value={activePublished === "ALL" ? null : activePublished}
        onSelect={(value) => push.current({ published: value })}
        onClear={() => push.current({ published: "ALL" })}
        clearLabel={labels.clearFilter}
      />
      {/* A toggle rather than a list: on or off, with how many it leaves. */}
      <FilterChip
        label={incompleteCount > 0 ? `${labels.incomplete} · ${incompleteCount}` : labels.incomplete}
        icon={Languages}
        options={[{ value: "true", label: labels.incomplete }]}
        value={incompleteOnly ? "true" : null}
        onSelect={() => push.current({ incomplete: "true" })}
        onClear={() => push.current({ incomplete: "false" })}
        clearLabel={labels.clearFilter}
      />
      <FilterChip
        label={labels.sort}
        icon={ArrowDownUp}
        options={[
          { value: "recent", label: labels.sortRecent },
          { value: "name", label: labels.sortName },
          { value: "unitsLeft", label: labels.sortUnitsLeft },
        ]}
        value={activeSort === "custom" ? null : activeSort}
        onSelect={(value) => push.current({ sort: value })}
        onClear={() => push.current({ sort: "custom" })}
        clearLabel={labels.clearFilter}
      />

      {pending && <Loader2 size={16} className="animate-spin text-adm-muted" aria-hidden />}
    </div>
  );
}
