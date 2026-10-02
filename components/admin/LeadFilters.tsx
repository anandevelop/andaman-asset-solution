"use client";

/**
 * components/admin/LeadFilters.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The leads toolbar: saved views, filter chips and search — every one of
 * them written straight into the query string, so the current view is
 * linkable and survives a refresh.
 *
 * SAVED VIEWS are four answers to "whose leads": everything, mine, nobody's
 * (with the count, because that is the number somebody has to bring to
 * zero), and past the response SLA. Each is just a combination of the
 * `assignedTo` and `overdue` parameters the filters already had, so a view
 * and a hand-set filter can never disagree about what they mean.
 *
 * CHIPS (FilterChip) are dashed while they filter nothing and turn solid
 * sand when they do, with an ✕ that clears them — so a glance at the
 * toolbar says whether the list is narrowed, which a row of identical
 * selects failed to say.
 *
 * Shared by the board and the table. Status and sort are table-only: the
 * board's columns already are the status filter, and a board has no single
 * sort order to pick.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LeadSource, LeadStatus } from "@prisma/client";
import Segmented from "@/components/admin/ui/Segmented";
import FilterChip from "@/components/admin/ui/FilterChip";
import { ArrowDownUp, Building2, CircleDot, Clock, Filter, Loader2, Search, UserRound, X } from "lucide-react";

type SavedView = "all" | "mine" | "unassigned" | "sla";

type Props = {
  locale: string;
  view: "board" | "table";
  currentUserId: string;
  /** SALES only ever sees its own and the unassigned pool, so picking a
   *  colleague is not a filter it can use. */
  canPickAssignee: boolean;
  activeStatus: string;
  activeSort: "newest" | "oldest";
  activeAssignee: string;
  activeProject: string;
  activeSource: string;
  activeRange: string;
  activeQuery: string;
  overdueOnly: boolean;
  overdueCount: number;
  unassignedCount: number;
  statusLabels: Record<LeadStatus, string>;
  sourceLabels: Record<LeadSource, string>;
  assignees: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  labels: {
    views: string;
    viewAll: string;
    viewMine: string;
    viewUnassigned: string;
    viewSla: string;
    search: string;
    clearSearch: string;
    /** The ✕ on an active filter chip. */
    clearFilter: string;
    status: string;
    sort: string;
    all: string;
    assigneeAll: string;
    newest: string;
    oldest: string;
    assignee: string;
    project: string;
    source: string;
    range: string;
    range7: string;
    range30: string;
    range90: string;
    range365: string;
  };
};

export default function LeadFilters(props: Props) {
  const { locale, view, currentUserId, labels } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(props.activeQuery);

  function setParam(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      /*
        Keep the default out of the URL — a bare /admin/leads should stay
        bare — EXCEPT for `range`, whose implicit default is not the same
        thing as "ALL". The board defaults to the last 90 days when the
        param is absent (matching the mockup); explicitly choosing "every
        lead, no date limit" therefore has to write range=ALL into the
        URL rather than deleting the key, or picking it would just fall
        straight back to the 90-day default it was meant to override. See
        the page component's own rangeDays fallback.
      */
      const isDefault =
        key !== "range" &&
        (value === "ALL" ||
          value === "newest" ||
          value === "" ||
          value === "false");
      if (isDefault) params.delete(key);
      else params.set(key, value);
    }
    // A drawer open on a lead the new filter hides would be a stranger.
    params.delete("lead");

    const next = params.toString();
    startTransition(() => {
      router.replace(`/${locale}/admin/leads${next ? `?${next}` : ""}`, {
        scroll: false,
      });
    });
  }

  /* Search waits for a pause in typing, so every keystroke is not a
     server render. */
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      if (query.trim() !== props.activeQuery) setParam({ q: query.trim() });
    }, 350);
    return () => window.clearTimeout(timer);
    // setParam is recreated each render; the query is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const savedView: SavedView | null = props.overdueOnly
    ? "sla"
    : props.activeAssignee === "unassigned"
      ? "unassigned"
      : props.activeAssignee === currentUserId
        ? "mine"
        : props.activeAssignee === "ALL"
          ? "all"
          : null;

  const views: {
    key: SavedView;
    label: string;
    count?: number;
    params: Record<string, string>;
  }[] = [
    {
      key: "all",
      label: labels.viewAll,
      params: { assignedTo: "ALL", overdue: "false" },
    },
    {
      key: "mine",
      label: labels.viewMine,
      params: { assignedTo: currentUserId, overdue: "false" },
    },
    {
      key: "unassigned",
      label: labels.viewUnassigned,
      count: props.unassignedCount,
      params: { assignedTo: "unassigned", overdue: "false" },
    },
    {
      key: "sla",
      label: labels.viewSla,
      count: props.overdueCount,
      params: { assignedTo: "ALL", overdue: "true" },
    },
  ];

  const sourceOptions = Object.values(LeadSource).map((source) => ({ value: source, label: props.sourceLabels[source] }));
  const rangeOptions = [
    { value: "7", label: labels.range7 },
    { value: "30", label: labels.range30 },
    { value: "90", label: labels.range90 },
    { value: "365", label: labels.range365 },
  ];

  /* One row, wrapping on narrow screens: saved views and chip filters on
     the left, search on the right (the mockup's toolbar). Every chip writes
     the same URL parameter its <select> did. */
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={labels.views}
        active={savedView}
        onSelect={(key) => {
          const item = views.find((candidate) => candidate.key === key);
          if (item) setParam(item.params);
        }}
        items={views.map((item) => ({
          key: item.key,
          label: item.label,
          count: item.count !== undefined && item.count > 0 ? item.count : undefined,
        }))}
      />

      <FilterChip
        label={labels.project}
        icon={Building2}
        options={props.projects.map((project) => ({ value: project.id, label: project.name }))}
        value={props.activeProject === "ALL" ? null : props.activeProject}
        onSelect={(value) => setParam({ project: value })}
        onClear={() => setParam({ project: "ALL" })}
        clearLabel={labels.clearFilter}
      />
      <FilterChip
        label={labels.source}
        icon={Filter}
        options={sourceOptions}
        value={props.activeSource === "ALL" ? null : props.activeSource}
        onSelect={(value) => setParam({ source: value })}
        onClear={() => setParam({ source: "ALL" })}
        clearLabel={labels.clearFilter}
      />
      {props.canPickAssignee && (
        <FilterChip
          label={labels.assignee}
          icon={UserRound}
          options={props.assignees.map((person) => ({ value: person.id, label: person.name }))}
          value={savedView ? null : props.activeAssignee}
          onSelect={(value) => setParam({ assignedTo: value, overdue: "false" })}
          onClear={() => setParam({ assignedTo: "ALL" })}
          clearLabel={labels.clearFilter}
        />
      )}
      {/* "Every lead" is range=ALL, written explicitly — see setParam. */}
      <FilterChip
        label={labels.range}
        icon={Clock}
        options={rangeOptions}
        value={props.activeRange === "ALL" ? null : props.activeRange}
        onSelect={(value) => setParam({ range: value })}
        onClear={() => setParam({ range: "ALL" })}
        clearLabel={labels.clearFilter}
      />
      {view === "table" && (
        <>
          <FilterChip
            label={labels.status}
            icon={CircleDot}
            options={Object.values(LeadStatus).map((status) => ({ value: status, label: props.statusLabels[status] }))}
            value={props.activeStatus === "ALL" ? null : props.activeStatus}
            onSelect={(value) => setParam({ status: value })}
            onClear={() => setParam({ status: "ALL" })}
            clearLabel={labels.clearFilter}
          />
          <FilterChip
            label={labels.sort}
            icon={ArrowDownUp}
            options={[
              { value: "newest", label: labels.newest },
              { value: "oldest", label: labels.oldest },
            ]}
            value={props.activeSort === "oldest" ? "oldest" : null}
            onSelect={(value) => setParam({ sort: value === "oldest" ? "oldest" : "newest" })}
            onClear={() => setParam({ sort: "newest" })}
            clearLabel={labels.clearFilter}
          />
        </>
      )}

      {pending && <Loader2 size={16} className="animate-spin text-adm-muted" aria-hidden />}

      <label className="relative ml-auto flex min-w-[220px] items-center">
        <span className="sr-only">{labels.search}</span>
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 text-adm-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          className="admin-input h-8 pl-9! pr-8!"
        />
        {query && (
          <button
            type="button"
            aria-label={labels.clearSearch}
            onClick={() => setQuery("")}
            className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full text-adm-muted hover:bg-adm-text/6"
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </label>
    </div>
  );
}
