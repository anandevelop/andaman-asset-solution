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
import { Loader2, Search, X } from "lucide-react";

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

  /* `w-auto!` matters: admin-input is w-full, and a flex-wrap row of
     full-width items puts every control on its own line. */
  const selectClass = "admin-input w-auto! max-w-[220px] py-2! text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative flex min-w-[260px] flex-1 items-center sm:max-w-md">
        <Search size={15} className="absolute left-3 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="admin-input py-2! pl-9! pr-28! text-sm"
        />
        <span className="pointer-events-none absolute right-3 border-l border-primary/10 pl-3 text-xs text-ink-muted">
          {labels.resultCount}
        </span>
      </div>

      <select
        aria-label={labels.type}
        value={activeType}
        onChange={(event) => push.current({ type: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">
          {labels.type}: {labels.all}
        </option>
        {Object.values(PropertyType).map((type) => (
          <option key={type} value={type}>
            {labels.type}: {typeLabels[type]}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.status}
        value={activeStatus}
        onChange={(event) => push.current({ status: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">
          {labels.status}: {labels.all}
        </option>
        {Object.values(ProjectStatus).map((status) => (
          <option key={status} value={status}>
            {labels.status}: {statusLabels[status]}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.published}
        value={activePublished}
        onChange={(event) => push.current({ published: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">
          {labels.published}: {labels.all}
        </option>
        <option value="PUBLISHED">
          {labels.published}: {labels.publishedOnly}
        </option>
        <option value="DRAFT">
          {labels.published}: {labels.draftOnly}
        </option>
      </select>

      {/* Same shape as the leads board's overdue chip: a toggle that also
          reports how many rows turning it on would leave. */}
      <button
        type="button"
        onClick={() => push.current({ incomplete: incompleteOnly ? "false" : "true" })}
        aria-pressed={incompleteOnly}
        className={[
          "flex items-center gap-1.5 rounded-xs border px-3 py-2 text-sm font-medium transition-colors",
          incompleteOnly
            ? "border-accent/50 bg-accent/10 text-accent-800"
            : "border-primary/15 bg-surface-raised text-ink-muted hover:border-accent/40 hover:text-accent-800",
        ].join(" ")}
      >
        {labels.incomplete}
        {incompleteCount > 0 && (
          <span
            className={[
              "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
              incompleteOnly ? "bg-accent text-white" : "bg-accent/15 text-accent-800",
            ].join(" ")}
          >
            {incompleteCount}
          </span>
        )}
        {incompleteOnly && <X size={13} aria-hidden />}
      </button>

      <select
        aria-label={labels.sort}
        value={activeSort}
        onChange={(event) => push.current({ sort: event.target.value })}
        className={`${selectClass} ml-auto`}
      >
        <option value="custom">
          {labels.sort}: {labels.sortCustom}
        </option>
        <option value="recent">
          {labels.sort}: {labels.sortRecent}
        </option>
        <option value="name">
          {labels.sort}: {labels.sortName}
        </option>
        <option value="unitsLeft">
          {labels.sort}: {labels.sortUnitsLeft}
        </option>
      </select>

      {pending && <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />}
    </div>
  );
}
