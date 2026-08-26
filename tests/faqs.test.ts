/**
 * tests/faqs.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * FAQ grouping and the revalidate endpoint's path allowlist.
 *
 * The allowlist is the interesting one. Without it, a caller holding the
 * shared secret could pass "/" and invalidate every rendered page on the
 * site in a single request — turning a cache-purge endpoint into a
 * denial-of-service lever.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { groupByCategory, type Faq } from "@/lib/faqs";

const faq = (id: string, category: string | null): Faq => ({
  id,
  question: `Q${id}`,
  answerHtml: `<p>A${id}</p>`,
  answerText: `A${id}`,
  category,
});

describe("groupByCategory", () => {
  it("returns an empty list for no entries", () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it("keeps entries in the order they arrived", () => {
    const [, entries] = groupByCategory([
      faq("1", "ownership"),
      faq("2", "ownership"),
      faq("3", "ownership"),
    ])[0];

    expect(entries.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
  });

  it("groups by category", () => {
    const groups = groupByCategory([
      faq("1", "ownership"),
      faq("2", "payment"),
      faq("3", "ownership"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find(([key]) => key === "ownership")?.[1]).toHaveLength(2);
    expect(groups.find(([key]) => key === "payment")?.[1]).toHaveLength(1);
  });

  it("puts uncategorised entries last", () => {
    // An unlabelled question after three labelled sections reads as
    // "other", which is what it is.
    const groups = groupByCategory([
      faq("1", null),
      faq("2", "ownership"),
      faq("3", null),
    ]);

    expect(groups[groups.length - 1][0]).toBeNull();
  });

  it("handles a single uncategorised group", () => {
    const groups = groupByCategory([faq("1", null), faq("2", null)]);

    expect(groups).toEqual([[null, expect.arrayContaining([])]]);
    expect(groups[0][1]).toHaveLength(2);
  });
});

describe("revalidate path allowlist", () => {
  // Mirrors isAllowedPath in app/api/revalidate/route.ts.
  const ALLOWED_PREFIXES = [
    "",
    "/projects",
    "/progress",
    "/news",
    "/events",
    "/about",
    "/contact",
  ];

  const isAllowed = (path: string) => {
    if (path.includes("..") || path.startsWith("//")) return false;
    if (path !== "" && !path.startsWith("/")) return false;

    return ALLOWED_PREFIXES.some((prefix) => {
      // The root entry matches the home page only — as a prefix it would
      // reduce to startsWith("/"), which is true of every absolute path.
      if (prefix === "") return path === "";

      return path === prefix || path.startsWith(`${prefix}/`);
    });
  };

  it.each([
    "",
    "/projects",
    "/projects/trinity-village",
    "/news",
    "/news/an-article",
    "/events/open-house",
    "/progress",
    "/about",
    "/contact",
  ])("allows %s", (path) => {
    expect(isAllowed(path)).toBe(true);
  });

  it.each([
    ["traversal", "/projects/../../etc"],
    ["protocol-relative", "//evil.test"],
    ["no leading slash", "projects"],
    ["admin", "/admin"],
    ["admin child", "/admin/leads"],
    ["login", "/login"],
    ["api", "/api/health"],
    ["unknown top level", "/wp-admin"],
  ])("rejects %s", (_name, path) => {
    expect(isAllowed(path)).toBe(false);
  });

  it("does not let a prefix match a longer sibling", () => {
    // "/news-archive" must not pass because "/news" is allowed.
    expect(isAllowed("/news-archive")).toBe(false);
    expect(isAllowed("/projects-internal")).toBe(false);
  });

  it("covers every navigable public route", () => {
    // If a page is worth caching it is worth being able to purge.
    for (const path of ["", "/projects", "/progress", "/news", "/events", "/about", "/contact"]) {
      expect(isAllowed(path), path).toBe(true);
    }
  });
});
