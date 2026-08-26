"use client";

/**
 * components/ProjectFilterBar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Filter and sort controls for /projects.
 *
 * State lives entirely in the URL. Nothing is held in React state, so the
 * back button works, a filtered view can be sent to a colleague, and the
 * server renders the correct result set on first paint rather than
 * flashing everything and then narrowing.
 *
 * `router.replace` rather than `push`: a visitor toggling four chips should
 * not have to press back four times to leave the page. Wrapped in
 * `startTransition` so the current results stay on screen, dimmed, while
 * the new ones stream in — a spinner over an empty grid reads as slower
 * even when it is not.
 *
 * Labels arrive pre-translated from the server. Enum copy already lives in
 * the `projects` namespace and there is no reason to ship a second copy of
 * it to the client.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import {
  SORT_OPTIONS,
  buildProjectQuery,
  countActiveFilters,
  parseProjectFilters,
  type ProjectFilters,
  type SortOption,
} from "@/lib/project-filters";

type Props = {
  locale: string;
  /** Facet values that actually return results. */
  available: { propertyTypes: string[]; statuses: string[] };
  resultCount: number;
  labels: {
    heading: string;
    propertyType: string;
    status: string;
    sort: string;
    all: string;
    clear: string;
    results: string;
    /** Keyed by enum value / sort option. */
    propertyTypes: Record<string, string>;
    statuses: Record<string, string>;
    sortOptions: Record<string, string>;
  };
};

export default function ProjectFilterBar({
  locale,
  available,
  resultCount,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const filters = parseProjectFilters(
    Object.fromEntries(searchParams.entries()),
  );
  const activeCount = countActiveFilters(filters);

  const navigate = (next: ProjectFilters) => {
    startTransition(() => {
      router.replace(`/${locale}/projects${buildProjectQuery(next)}`, {
        // The filter bar is at the top of the results; jumping to the page
        // head on every toggle would move it out from under the cursor.
        scroll: false,
      });
    });
  };

  /** Chips toggle: tapping the active one clears it. */
  const toggle = <K extends "propertyType" | "status">(
    key: K,
    value: ProjectFilters[K],
  ) => {
    navigate({ ...filters, [key]: filters[key] === value ? null : value });
  };

  const chip = (active: boolean) =>
    [
      "rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors",
      active
        ? "border-primary bg-primary text-white"
        : "border-primary/15 text-ink/70 hover:border-primary/40 hover:text-primary",
    ].join(" ");

  return (
    <section
      aria-label={labels.heading}
      className="border-y border-primary/10 bg-white/60"
    >
      <div className="space-y-5 py-6">
        {/* ── Property type ──────────────────────────────────────────── */}
        {available.propertyTypes.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 w-full text-[11px] font-medium uppercase tracking-wide text-ink/65 sm:w-auto">
              {labels.propertyType}
            </span>

            <button
              type="button"
              onClick={() => navigate({ ...filters, propertyType: null })}
              aria-pressed={filters.propertyType === null}
              className={chip(filters.propertyType === null)}
            >
              {labels.all}
            </button>

            {available.propertyTypes.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => toggle("propertyType", value as never)}
                aria-pressed={filters.propertyType === value}
                className={chip(filters.propertyType === value)}
              >
                {labels.propertyTypes[value] ?? value}
              </button>
            ))}
          </div>
        )}

        {/* ── Status ─────────────────────────────────────────────────── */}
        {available.statuses.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 w-full text-[11px] font-medium uppercase tracking-wide text-ink/65 sm:w-auto">
              {labels.status}
            </span>

            <button
              type="button"
              onClick={() => navigate({ ...filters, status: null })}
              aria-pressed={filters.status === null}
              className={chip(filters.status === null)}
            >
              {labels.all}
            </button>

            {available.statuses.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => toggle("status", value as never)}
                aria-pressed={filters.status === value}
                className={chip(filters.status === value)}
              >
                {labels.statuses[value] ?? value}
              </button>
            ))}
          </div>
        )}

        {/* ── Result count, sort, clear ──────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-primary/10 pt-5">
          <p className="flex items-center gap-2 text-sm text-ink/70">
            {pending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <SlidersHorizontal size={14} className="text-accent-700" aria-hidden />
            )}
            <span aria-live="polite">{labels.results}</span>
          </p>

          <div className="flex items-center gap-3">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate({
                    propertyType: null,
                    status: null,
                    sort: filters.sort,
                  })
                }
                className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink/65 transition-colors hover:text-primary"
              >
                <X size={13} aria-hidden />
                {labels.clear} ({activeCount})
              </button>
            )}

            <label className="relative flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink/65">
                {labels.sort}
              </span>

              <select
                value={filters.sort}
                onChange={(event) =>
                  navigate({ ...filters, sort: event.target.value as SortOption })
                }
                className="appearance-none rounded-sm border border-primary/15 bg-white py-1.5 pl-3 pr-8 text-xs text-ink transition-colors hover:border-primary/40 focus:border-primary/40 focus:outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {labels.sortOptions[option] ?? option}
                  </option>
                ))}
              </select>

              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2.5 text-ink/65"
                aria-hidden
              />
            </label>
          </div>
        </div>
      </div>

    </section>
  );
}
