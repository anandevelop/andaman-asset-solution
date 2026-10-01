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
 * CHIPS are dashed while they filter nothing and turn solid when they do,
 * so a glance at the toolbar says whether the list is narrowed — the thing
 * a row of identical selects failed to say.
 *
 * Shared by the board and the table. Status and sort are table-only: the
 * board's columns already are the status filter, and a board has no single
 * sort order to pick.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LeadSource, LeadStatus } from "@prisma/client";
import { ChevronDown, Loader2, Search, X } from "lucide-react";

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

  /* Dashed until it narrows something. `w-auto!`: admin-input is w-full,
     which would stack the chips one per line. */
  const chip = (active: boolean) =>
    [
      "h-8 w-auto! max-w-[220px] cursor-pointer appearance-none rounded-full border py-0 pl-3 pr-7 text-[12.5px] transition-colors",
      active
        ? "border-solid border-adm-info bg-adm-status-info-bg font-medium text-adm-status-info"
        : "border-dashed border-adm-line-strong bg-transparent text-ink-muted hover:border-adm-info hover:text-ink",
    ].join(" ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={labels.views}
          className="inline-flex rounded-[10px] border border-adm-line bg-surface p-0.5"
        >
          {views.map((item) => {
            const selected = savedView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setParam(item.params)}
                className={[
                  "flex h-7 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] transition-colors",
                  selected
                    ? "bg-adm-solid font-medium text-ink shadow-[0_0_0_1px_var(--adm-line)]"
                    : "text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={[
                      "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                      item.key === "sla"
                        ? "bg-adm-danger-bg text-adm-danger"
                        : "bg-adm-fill text-adm-on-fill",
                    ].join(" ")}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <label className="relative ml-auto flex min-w-[220px] flex-1 items-center sm:max-w-[320px]">
          <span className="sr-only">{labels.search}</span>
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 text-ink-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
            className="admin-input h-9 pl-9! pr-8!"
          />
          {query && (
            <button
              type="button"
              aria-label={labels.clearSearch}
              onClick={() => setQuery("")}
              className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-primary/5"
            >
              <X size={13} aria-hidden />
            </button>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip>
          <select
            aria-label={labels.project}
            value={props.activeProject}
            onChange={(event) => setParam({ project: event.target.value })}
            className={chip(props.activeProject !== "ALL")}
          >
            <option value="ALL">{labels.project}</option>
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Chip>

        <Chip>
          <select
            aria-label={labels.source}
            value={props.activeSource}
            onChange={(event) => setParam({ source: event.target.value })}
            className={chip(props.activeSource !== "ALL")}
          >
            <option value="ALL">{labels.source}</option>
            {Object.values(LeadSource).map((source) => (
              <option key={source} value={source}>
                {props.sourceLabels[source]}
              </option>
            ))}
          </select>
        </Chip>

        <Chip>
          <select
            aria-label={labels.range}
            value={props.activeRange}
            onChange={(event) => setParam({ range: event.target.value })}
            className={chip(props.activeRange !== "ALL")}
          >
            <option value="ALL">
              {labels.range}: {labels.all}
            </option>
            <option value="7">{labels.range7}</option>
            <option value="30">{labels.range30}</option>
            <option value="90">{labels.range90}</option>
            <option value="365">{labels.range365}</option>
          </select>
        </Chip>

        {props.canPickAssignee && (
          <Chip>
            <select
              aria-label={labels.assignee}
              value={savedView ? "ALL" : props.activeAssignee}
              onChange={(event) =>
                setParam({ assignedTo: event.target.value, overdue: "false" })
              }
              className={chip(savedView === null)}
            >
              <option value="ALL">{labels.assignee}</option>
              {props.assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </Chip>
        )}

        {view === "table" && (
          <>
            <Chip>
              <select
                aria-label={labels.status}
                value={props.activeStatus}
                onChange={(event) => setParam({ status: event.target.value })}
                className={chip(props.activeStatus !== "ALL")}
              >
                <option value="ALL">{labels.status}</option>
                {Object.values(LeadStatus).map((status) => (
                  <option key={status} value={status}>
                    {props.statusLabels[status]}
                  </option>
                ))}
              </select>
            </Chip>

            <Chip>
              <select
                aria-label={labels.sort}
                value={props.activeSort}
                onChange={(event) =>
                  setParam({
                    sort: event.target.value === "oldest" ? "oldest" : "newest",
                  })
                }
                className={chip(props.activeSort !== "newest")}
              >
                <option value="newest">{labels.newest}</option>
                <option value="oldest">{labels.oldest}</option>
              </select>
            </Chip>
          </>
        )}

        {pending && (
          <Loader2
            size={16}
            className="animate-spin text-ink-muted"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

/** A native select dressed as a chip — the arrow drawn over it, in the
 *  text colour, since appearance-none removes the browser's own. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex items-center">
      {children}
      <ChevronDown
        size={12}
        aria-hidden
        className="pointer-events-none absolute right-2.5 text-current opacity-60"
      />
    </span>
  );
}
