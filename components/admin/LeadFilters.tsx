"use client";

/**
 * components/admin/LeadFilters.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Every leads-page filter, written straight into the query string so the
 * current view is linkable and survives a refresh — the same convention
 * the dashboard's own date-range control uses (DashboardControls.tsx).
 *
 * Shared by both views (LeadBoard.dc.html's board and the pre-existing
 * table) rather than two separate filter bars: assignee/project/
 * source/range/overdue mean the same thing in either view, and only
 * status+sort are table-only — the board's columns already are the
 * status filter, and a board has no single sort order to pick.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LeadSource, LeadStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";

type Props = {
  locale: string;
  view: "board" | "table";
  activeStatus: string;
  activeSort: "newest" | "oldest";
  activeAssignee: string;
  activeProject: string;
  activeSource: string;
  activeRange: string;
  overdueOnly: boolean;
  overdueCount: number;
  statusLabels: Record<LeadStatus, string>;
  sourceLabels: Record<LeadSource, string>;
  assignees: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  labels: {
    status: string;
    sort: string;
    all: string;
    /** The assignee filter's own "everyone" option — "the whole team", not
     *  the generic "all" every other filter uses (LeadBoard.dc.html). */
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
    overdueOnly: string;
  };
};

export default function LeadFilters({
  locale,
  view,
  activeStatus,
  activeSort,
  activeAssignee,
  activeProject,
  activeSource,
  activeRange,
  overdueOnly,
  overdueCount,
  statusLabels,
  sourceLabels,
  assignees,
  projects,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

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
        (value === "ALL" || value === "newest" || value === "" || value === "false");
      if (isDefault) params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(`/${locale}/admin/leads${query ? `?${query}` : ""}`);
    });
  }

  /* `w-auto!` matters: admin-input is w-full, so without it every select
     takes the whole row and the four filters stack one per line instead of
     sitting side by side. Same fix as ProjectFilters and RegistrationFilters.
     It was always wrong; the wider admin container just made it obvious. */
  const selectClass = "admin-input w-auto! min-w-[160px] max-w-[240px] py-2! text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <select
        aria-label={labels.assignee}
        value={activeAssignee}
        onChange={(event) => setParam({ assignedTo: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">{labels.assignee}: {labels.assigneeAll}</option>
        {assignees.map((person) => (
          <option key={person.id} value={person.id}>
            {labels.assignee}: {person.name}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.project}
        value={activeProject}
        onChange={(event) => setParam({ project: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">{labels.project}: {labels.all}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {labels.project}: {project.name}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.source}
        value={activeSource}
        onChange={(event) => setParam({ source: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">{labels.source}: {labels.all}</option>
        {Object.values(LeadSource).map((source) => (
          <option key={source} value={source}>
            {labels.source}: {sourceLabels[source]}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.range}
        value={activeRange}
        onChange={(event) => setParam({ range: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">{labels.range}: {labels.all}</option>
        <option value="7">{labels.range7}</option>
        <option value="30">{labels.range30}</option>
        <option value="90">{labels.range90}</option>
        <option value="365">{labels.range365}</option>
      </select>

      {view === "table" && (
        <>
          <select
            aria-label={labels.status}
            value={activeStatus}
            onChange={(event) => setParam({ status: event.target.value })}
            className={selectClass}
          >
            <option value="ALL">{labels.status}: {labels.all}</option>
            {Object.values(LeadStatus).map((status) => (
              <option key={status} value={status}>
                {labels.status}: {statusLabels[status]}
              </option>
            ))}
          </select>

          <select
            aria-label={labels.sort}
            value={activeSort}
            onChange={(event) => setParam({ sort: event.target.value === "oldest" ? "oldest" : "newest" })}
            className={selectClass}
          >
            <option value="newest">{labels.newest}</option>
            <option value="oldest">{labels.oldest}</option>
          </select>
        </>
      )}

      <button
        type="button"
        onClick={() => setParam({ overdue: overdueOnly ? "false" : "true" })}
        aria-pressed={overdueOnly}
        className={[
          "flex items-center gap-1.5 rounded-xs border px-3 py-2 text-sm font-medium transition-colors",
          overdueOnly
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-primary/15 bg-surface-raised text-ink-muted hover:border-red-200 hover:text-red-700",
        ].join(" ")}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdueOnly ? "bg-red-600" : "bg-red-400"}`}
          aria-hidden
        />
        {labels.overdueOnly}
        {overdueCount > 0 && (
          <span
            className={[
              "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
              overdueOnly ? "bg-red-600 text-white" : "bg-red-100 text-red-700",
            ].join(" ")}
          >
            {overdueCount}
          </span>
        )}
      </button>

      {pending && <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />}
    </div>
  );
}
