/**
 * tests/news-list.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The filter parsing for the article index.
 *
 * Query strings arrive from links people paste to each other and from
 * bookmarks made months ago, so the cases here are the malformed ones: a
 * page number past the end, a page size nobody offers, a sort key from a
 * version of this screen that no longer exists. Every one of them has to
 * land on a sane view rather than an empty table.
 *
 * The query itself is not tested here — it needs a database, and
 * tests/audit-integration.test.ts is the only suite in this project that
 * takes one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  ARTICLES_PER_PAGE,
  PER_PAGE_OPTIONS,
  SORT_OPTIONS,
  parseFilters,
} from "@/lib/admin/news-list";

describe("parseFilters", () => {
  it("defaults to most-read, first page, everything shown", () => {
    expect(parseFilters({})).toEqual({
      search: "",
      category: "ALL",
      status: "ALL",
      author: "ALL",
      incompleteOnly: false,
      sort: "views",
      page: 1,
      perPage: ARTICLES_PER_PAGE,
    });
  });

  it("reads a full query string", () => {
    expect(
      parseFilters({
        q: "  phuket  ",
        category: "Guides",
        status: "draft",
        author: "user_1",
        incomplete: "1",
        sort: "leads",
        page: "3",
        perPage: "25",
      }),
    ).toEqual({
      search: "phuket",
      category: "Guides",
      status: "draft",
      author: "user_1",
      incompleteOnly: true,
      sort: "leads",
      page: 3,
      perPage: 25,
    });
  });

  it("falls back to the default sort for a key it does not know", () => {
    // A bookmark from an earlier version of this screen must not produce
    // an unsorted table.
    expect(parseFilters({ sort: "clicks" }).sort).toBe("views");
  });

  it("accepts every sort the screen offers", () => {
    for (const sort of SORT_OPTIONS) {
      expect(parseFilters({ sort }).sort).toBe(sort);
    }
  });

  it("refuses a page size that is not on the menu", () => {
    // Otherwise "?perPage=100000" is a request to render every article.
    expect(parseFilters({ perPage: "100000" }).perPage).toBe(ARTICLES_PER_PAGE);
    expect(parseFilters({ perPage: "abc" }).perPage).toBe(ARTICLES_PER_PAGE);

    for (const perPage of PER_PAGE_OPTIONS) {
      expect(parseFilters({ perPage: String(perPage) }).perPage).toBe(perPage);
    }
  });

  it("clamps a nonsense page number to the first page", () => {
    expect(parseFilters({ page: "0" }).page).toBe(1);
    expect(parseFilters({ page: "-4" }).page).toBe(1);
    expect(parseFilters({ page: "two" }).page).toBe(1);
    expect(parseFilters({ page: "2.7" }).page).toBe(2);
  });

  it("takes the first value when a param is repeated", () => {
    // Next hands over an array when a key appears twice in the URL.
    expect(parseFilters({ status: ["draft", "published"] }).status).toBe("draft");
  });

  it("treats anything but 1 as the chip being off", () => {
    expect(parseFilters({ incomplete: "true" }).incompleteOnly).toBe(false);
    expect(parseFilters({ incomplete: "0" }).incompleteOnly).toBe(false);
    expect(parseFilters({ incomplete: "1" }).incompleteOnly).toBe(true);
  });
});
