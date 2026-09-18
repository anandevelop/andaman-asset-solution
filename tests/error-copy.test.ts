/**
 * tests/error-copy.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The error boundaries are the one place a missing translation cannot be
 * caught by tests/i18n.test.ts, because they deliberately do not use
 * next-intl — a boundary that may be rendering *because* messages failed to
 * load cannot go and load messages.
 *
 * So the parity check lives here instead. The site shipped th/en/zh/ru
 * while all three boundaries carried two locales each, and they disagreed
 * about the fallback: error.tsx served English to a Chinese visitor,
 * global-error.tsx served Thai to the same one, and not-found.tsx had
 * already crashed on `undefined.code` when a URL matched a locale its table
 * did not have.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  BOUNDARY_DEFAULT_LOCALE,
  GLOBAL_ERROR_COPY,
  NOT_FOUND_COPY,
  ROUTE_ERROR_COPY,
  localeFromPathname,
} from "@/lib/error-copy";
import { locales, defaultLocale } from "@/i18n";
import en from "@/messages/en.json";

describe("localeFromPathname", () => {
  it.each([
    ["/th", "th"],
    ["/th/projects", "th"],
    ["/en", "en"],
    ["/en/about", "en"],
    ["/zh", "zh"],
    ["/zh/news/some-article", "zh"],
    ["/ru", "ru"],
    ["/ru/events/open-house", "ru"],
  ])("reads %s as %s", (pathname, expected) => {
    expect(localeFromPathname(pathname)).toBe(expected);
  });

  it.each([["/"], [""], [null], [undefined]])(
    "falls back to the default for %s",
    (pathname) => {
      expect(localeFromPathname(pathname)).toBe(BOUNDARY_DEFAULT_LOCALE);
    },
  );

  /*
    Whole-segment matching, not prefix matching. A `startsWith("/th")` test
    — which is what error.tsx used to do — reads /thailand-guide as Thai.
    The /zhuhai case is the one that proves the point without the default
    masking it: it must NOT come back as "zh".
  */
  it.each([["/thailand-guide"], ["/english"], ["/zhuhai"], ["/rugby"]])(
    "does not treat %s as a locale segment",
    (pathname) => {
      expect(localeFromPathname(pathname)).toBe(BOUNDARY_DEFAULT_LOCALE);
    },
  );
});

/**
 * The test that makes this class of bug unreintroducible.
 *
 * lib/error-copy.ts cannot import from @/i18n — that module pulls in
 * next-intl/server, the exact dependency a boundary must not carry — so the
 * locale list is duplicated there. This is what keeps the duplicate honest:
 * adding a fifth locale to i18n.ts now fails here, loudly, instead of
 * silently serving Thai to everyone who speaks it.
 */
describe("boundary copy covers every routing locale", () => {
  // Widened deliberately: the three tables have different key sets, and a
  // union of them would make every Object.entries() below `unknown`.
  const TABLES: Record<string, Record<string, Record<string, string>>> = {
    ROUTE_ERROR_COPY,
    GLOBAL_ERROR_COPY,
    NOT_FOUND_COPY,
  };

  it("agrees with i18n.ts about the default locale", () => {
    expect(BOUNDARY_DEFAULT_LOCALE).toBe(defaultLocale);
  });

  it.each(Object.entries(TABLES))("%s has exactly the routing locales", (_name, table) => {
    expect(Object.keys(table).sort()).toEqual([...locales].sort());
  });

  it.each(Object.entries(TABLES))("%s defines the same keys in every locale", (_name, table) => {
    const expected = Object.keys(table[defaultLocale]).sort();

    for (const [locale, copy] of Object.entries(table)) {
      expect(Object.keys(copy).sort(), locale).toEqual(expected);
    }
  });

  it.each(Object.entries(TABLES))("%s has no empty string", (_name, table) => {
    for (const [locale, copy] of Object.entries(table)) {
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("gives each locale its own wording rather than copying one across", () => {
    // A table filled in by duplicating English would satisfy every check
    // above. Titles are the shortest field that must genuinely differ.
    const titles = Object.values(ROUTE_ERROR_COPY).map((copy) => copy.title);

    expect(new Set(titles).size).toBe(titles.length);
  });
});

/**
 * app/[locale]/admin/error.tsx resolves its message key at runtime from a
 * lookup table, so tests/i18n.test.ts's source scan — which looks for
 * literal t("…") calls — cannot see these five. If one is renamed in the
 * message files, the boundary falls back to the generic error instead of
 * throwing (t.has guards it), which is safe but silently wrong.
 */
describe("admin error boundary message keys", () => {
  // Through unknown, because messages/en.json's inferred type has string
  // leaves alongside groups — `admin.brand` is a string, `admin.common` is
  // not — so there is no honest index signature over the whole object.
  const admin: Record<string, unknown> = en.admin;

  it.each([
    ["users", "selfLocked"],
    ["users", "lastSuperAdmin"],
    ["common", "denied"],
    ["common", "error"],
    ["common", "back"],
  ])("admin.%s.%s exists", (namespace, key) => {
    const group = admin[namespace] as Record<string, unknown> | undefined;

    expect(group?.[key]).toBeTruthy();
  });
});
