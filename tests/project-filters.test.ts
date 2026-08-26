/**
 * tests/project-filters.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Filter parsing and serialisation for /projects.
 *
 * Every value here arrives from the query string, so the tests are mostly
 * about hostile and stale input: a bookmark from before a status was
 * renamed, a hand-edited URL, a repeated parameter. None of those should
 * produce an error page — they should degrade to "show everything".
 *
 * The round-trip property matters most: parse(build(x)) === x. Without it
 * a shared filtered URL silently opens on a different result set than the
 * sender saw.
 *
 * No price-band tests here on purpose — the site dropped price filtering
 * and price sorting entirely (see lib/project-filters.ts's header comment).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  SORT_OPTIONS,
  buildProjectQuery,
  countActiveFilters,
  hasActiveFilters,
  parseProjectFilters,
  type ProjectFilters,
} from "@/lib/project-filters";
import { PROPERTY_TYPES, PROJECT_STATUSES } from "@/lib/validations";

describe("parseProjectFilters", () => {
  it("returns defaults for an empty query", () => {
    expect(parseProjectFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("reads every recognised facet", () => {
    expect(
      parseProjectFilters({
        type: "POOL_VILLA",
        status: "UNDER_CONSTRUCTION",
        sort: "newest",
      }),
    ).toEqual({
      propertyType: "POOL_VILLA",
      status: "UNDER_CONSTRUCTION",
      sort: "newest",
    });
  });

  it.each([
    ["type", "NOT_A_TYPE", "propertyType"],
    ["status", "DEMOLISHED", "status"],
  ])("drops an unrecognised %s rather than erroring", (param, value, field) => {
    const filters = parseProjectFilters({ [param]: value });

    expect(filters[field as keyof ProjectFilters]).toBeNull();
  });

  it("falls back to the default sort for an unknown value", () => {
    expect(parseProjectFilters({ sort: "random" }).sort).toBe(DEFAULT_SORT);
  });

  it("honours only the first value of a repeated parameter", () => {
    // ?status=A&status=B must not produce a contradictory query.
    expect(
      parseProjectFilters({ status: ["UPCOMING", "SOLD_OUT"] }).status,
    ).toBe("UPCOMING");
  });

  it("is case sensitive — enum values are exact", () => {
    expect(parseProjectFilters({ type: "pool_villa" }).propertyType).toBeNull();
  });

  it("ignores unrelated parameters", () => {
    expect(
      parseProjectFilters({ utm_source: "line", page: "2" }),
    ).toEqual(EMPTY_FILTERS);
  });

  it("accepts every declared enum value", () => {
    for (const type of PROPERTY_TYPES) {
      expect(parseProjectFilters({ type }).propertyType).toBe(type);
    }
    for (const status of PROJECT_STATUSES) {
      expect(parseProjectFilters({ status }).status).toBe(status);
    }
    for (const sort of SORT_OPTIONS) {
      expect(parseProjectFilters({ sort }).sort).toBe(sort);
    }
  });
});

describe("buildProjectQuery", () => {
  it("produces an empty string for no filters", () => {
    // A cleared filter bar must land on a bare /projects — two URLs for
    // the canonical page is an SEO problem.
    expect(buildProjectQuery(EMPTY_FILTERS)).toBe("");
  });

  it("omits the default sort", () => {
    expect(buildProjectQuery({ ...EMPTY_FILTERS, sort: DEFAULT_SORT })).toBe("");
  });

  it("includes a non-default sort", () => {
    expect(buildProjectQuery({ ...EMPTY_FILTERS, sort: "newest" })).toBe(
      "?sort=newest",
    );
  });

  it("serialises every active facet", () => {
    const query = buildProjectQuery({
      propertyType: "POOL_VILLA",
      status: "UPCOMING",
      sort: "newest",
    });

    const params = new URLSearchParams(query.slice(1));

    expect(params.get("type")).toBe("POOL_VILLA");
    expect(params.get("status")).toBe("UPCOMING");
    expect(params.get("sort")).toBe("newest");
  });
});

describe("round trip", () => {
  const combinations: ProjectFilters[] = [
    EMPTY_FILTERS,
    { ...EMPTY_FILTERS, propertyType: "TOWNHOME" },
    { ...EMPTY_FILTERS, status: "READY_TO_MOVE_IN" },
    { ...EMPTY_FILTERS, sort: "newest" },
    {
      propertyType: "CONDOMINIUM",
      status: "SOLD_OUT",
      sort: "newest",
    },
  ];

  it.each(combinations)("parse(build(%o)) is identity", (filters) => {
    const query = buildProjectQuery(filters);
    const params = Object.fromEntries(new URLSearchParams(query.slice(1)));

    expect(parseProjectFilters(params)).toEqual(filters);
  });
});

describe("hasActiveFilters / countActiveFilters", () => {
  it("treats sort alone as not filtering", () => {
    // Sorting reorders the same set; it does not narrow it, so it must not
    // trigger the "clear filters" affordance or the noindex.
    const sorted = { ...EMPTY_FILTERS, sort: "newest" as const };

    expect(hasActiveFilters(sorted)).toBe(false);
    expect(countActiveFilters(sorted)).toBe(0);
  });

  it("counts each active facet", () => {
    expect(
      countActiveFilters({
        propertyType: "POOL_VILLA",
        status: "UPCOMING",
        sort: DEFAULT_SORT,
      }),
    ).toBe(2);
  });

  it("is true when any facet is set", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, propertyType: "TOWNHOME" })).toBe(
      true,
    );
  });
});
