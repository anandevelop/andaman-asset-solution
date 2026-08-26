/**
 * lib/project-filters.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Parsing and validation for the /projects filter state.
 *
 * Kept out of lib/projects.ts because both the server page and the client
 * filter bar need it, and lib/projects.ts is `server-only`. Importing that
 * into a client component would fail the build.
 *
 * Everything here is defensive: filter values arrive from the query string,
 * which anyone can edit. An unrecognised value is dropped rather than
 * rejected — a stale bookmark should show all projects, not an error page.
 *
 * No price band / price sort here on purpose — the site no longer shows
 * prices anywhere, public or admin (see FeaturedProjectCard.tsx's header
 * comment). This used to also export PRICE_BANDS/PriceBandId/
 * priceBandBounds() and a "price-asc"/"price-desc" pair of SORT_OPTIONS.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PROPERTY_TYPES, PROJECT_STATUSES } from "@/lib/validations";

export type PropertyTypeValue = (typeof PROPERTY_TYPES)[number];
export type ProjectStatusValue = (typeof PROJECT_STATUSES)[number];

export const SORT_OPTIONS = ["featured", "newest"] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOption = "featured";

export type ProjectFilters = {
  propertyType: PropertyTypeValue | null;
  status: ProjectStatusValue | null;
  sort: SortOption;
};

export const EMPTY_FILTERS: ProjectFilters = {
  propertyType: null,
  status: null,
  sort: DEFAULT_SORT,
};

/** Narrow an arbitrary string to a member of `allowed`, or null. */
function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Read filters off a searchParams object.
 *
 * Next passes repeated params as string[]; only the first is honoured, so
 * `?status=A&status=B` cannot produce a contradictory query.
 */
export function parseProjectFilters(
  searchParams: Record<string, string | string[] | undefined> = {},
): ProjectFilters {
  const first = (key: string): string | undefined => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    propertyType: oneOf(first("type"), PROPERTY_TYPES),
    status: oneOf(first("status"), PROJECT_STATUSES),
    sort: oneOf(first("sort"), SORT_OPTIONS) ?? DEFAULT_SORT,
  };
}

/**
 * Filters → query string.
 *
 * Defaults are omitted so a cleared filter bar produces a bare `/projects`
 * rather than `/projects?sort=featured`. That matters for SEO: the
 * canonical page should not be reachable at two URLs.
 */
export function buildProjectQuery(filters: ProjectFilters): string {
  const params = new URLSearchParams();

  if (filters.propertyType) params.set("type", filters.propertyType);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** True when nothing is narrowing the result set. */
export function hasActiveFilters(filters: ProjectFilters): boolean {
  return Boolean(filters.propertyType || filters.status);
}

/** How many facets are active — drives the "clear (n)" badge. */
export function countActiveFilters(filters: ProjectFilters): number {
  return [filters.propertyType, filters.status].filter(Boolean).length;
}
