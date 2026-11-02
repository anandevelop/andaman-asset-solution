/**
 * tests/redirect-paths.test.ts
 *
 * Redirect rows are locale-relative. What gets pasted into the form is the
 * address bar, so "/en/projects/x" and full URLs must be stored as
 * "/projects/x", and a target of "/en" must not come out as /en/en.
 */

import { describe, expect, it } from "vitest";
import {
  normaliseRedirectPath,
  redirectDestination,
  redirectLookupKeys,
} from "@/lib/redirect-paths";

describe("normaliseRedirectPath", () => {
  it.each([
    ["/en/projects/trinity-village-2", "/projects/trinity-village-2"],
    ["/th/e-brochure/victory-victory-2/", "/e-brochure/victory-victory-2"],
    ["https://andamanassetsolution.com/ru/news/a?utm=x#top", "/news/a"],
    ["https://www.andamanassetsolution.com/zh", "/"],
    ["/en", "/"],
    ["/en-0", "/en-0"],
    ["/english-page", "/english-page"],
    ["projects/x", "/projects/x"],
    ["/", "/"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseRedirectPath(raw)).toBe(expected);
  });

  it("leaves another site's URL alone", () => {
    expect(normaliseRedirectPath("https://example.com/en/x")).toBe("https://example.com/en/x");
  });
});

describe("redirectDestination", () => {
  it("puts the visitor's locale in front", () => {
    expect(redirectDestination("th", "/projects/x")).toBe("/th/projects/x");
    expect(redirectDestination("en", "/")).toBe("/en");
  });

  it("keeps a target already carrying a locale (old rows)", () => {
    expect(redirectDestination("zh", "/en")).toBe("/en");
    expect(redirectDestination("zh", "/en/projects/x")).toBe("/en/projects/x");
  });

  it("sends external targets unchanged", () => {
    expect(redirectDestination("en", "https://example.com/a")).toBe("https://example.com/a");
  });
});

describe("redirectLookupKeys", () => {
  it("covers the relative row and rows saved with a locale", () => {
    expect(redirectLookupKeys("/projects/x")).toEqual([
      "/projects/x",
      "/en/projects/x",
      "/th/projects/x",
      "/zh/projects/x",
      "/ru/projects/x",
    ]);
  });
});
