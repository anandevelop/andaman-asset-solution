import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { parseNewsQuery } = await import("@/lib/news");

/* /news answered 500 on the live site for "?q=a&q=b" and
   "?category=a&category=b": Next passes a repeated key as an array. */
describe("parseNewsQuery", () => {
  it("takes the first of a repeated key", () => {
    expect(parseNewsQuery({ q: ["villa", "pool"], category: ["csr", "news"], page: ["2", "3"] })).toEqual({
      search: "villa",
      category: "csr",
      page: 2,
    });
  });

  it.each([["1.5", 1], ["abc", 1], ["0", 1], ["-3", 1], ["1e20", 1e20], [undefined, 1], ["4", 4]])(
    "reads page %j as %j",
    (page, expected) => {
      expect(parseNewsQuery({ page }).page).toBe(expected);
    },
  );

  it("leaves an empty search and no category alone", () => {
    expect(parseNewsQuery({ q: "  ", category: "" })).toEqual({ search: "", category: undefined, page: 1 });
  });
});
