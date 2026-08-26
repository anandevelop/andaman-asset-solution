/**
 * tests/i18n.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Translation-file integrity.
 *
 * next-intl throws at render time for a missing key, so a Thai file that
 * has drifted behind the English one takes a page down rather than falling
 * back. Nothing in the type system catches it, which makes this the
 * cheapest high-value test in the suite.
 *
 * Also checks that every key referenced from source actually exists —
 * the failure that produces a raw "admin.leads.title" on screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import th from "../messages/th.json";
import zh from "../messages/zh.json";
import ru from "../messages/ru.json";

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? flatten(value as Messages, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const enKeys = flatten(en as Messages);

/**
 * Every non-English locale, checked against English — the source of truth
 * every Sale Kit and every other locale's copy was translated from (see
 * i18n.ts: locales = ["en", "th", "zh", "ru"]). Adding a fifth locale is a
 * one-line addition here, not a new set of tests.
 */
const otherLocales: [string, Messages][] = [
  ["th", th as Messages],
  ["zh", zh as Messages],
  ["ru", ru as Messages],
];

describe("message files", () => {
  it("define the same keys in every locale", () => {
    for (const [name, messages] of otherLocales) {
      const keys = flatten(messages);
      const missing = enKeys.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !enKeys.includes(key));

      expect({ locale: name, missing, extra }).toEqual({ locale: name, missing: [], extra: [] });
    }
  });

  it("has no empty translations", () => {
    const collect = (messages: Messages, prefix = ""): string[] =>
      Object.entries(messages).flatMap(([key, value]) =>
        typeof value === "object" && value !== null
          ? collect(value as Messages, `${prefix}${key}.`)
          : typeof value === "string" && value.trim().length === 0
            ? [`${prefix}${key}`]
            : [],
      );

    expect(collect(en as Messages)).toEqual([]);
    for (const [, messages] of otherLocales) {
      expect(collect(messages)).toEqual([]);
    }
  });

  it("uses matching ICU placeholders across locales", () => {
    // A {count} present in English but missing in another locale renders a
    // sentence with a hole in it — and an extra one throws at format time.
    /**
     * Argument names at brace depth zero only.
     *
     * A naive /\{(\w+)[,}]/ also matches the *body* of a plural branch —
     * "=0 {empty}" would be read as an argument called "empty" — so two
     * locales appear to disagree whenever one happens to use a
     * single-word branch. Depth tracking is what distinguishes
     * "{minutes, plural, …}" from the branches nested inside it.
     *
     * Deliberately checks argument *names* only, not the plural category
     * keywords (=0/one/few/many/other) inside each branch — zh has no
     * "one" category and ru adds "few"/"many" that en/th don't use, all
     * of which is valid per-locale ICU, not a translation bug. See
     * messages/zh.json and messages/ru.json's plural branches.
     */
    const argumentNames = (pattern: string): Set<string> => {
      const names = new Set<string>();
      let depth = 0;

      for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];

        if (char === "}") {
          depth = Math.max(0, depth - 1);
          continue;
        }

        if (char !== "{") continue;

        if (depth === 0) {
          const match = /^\{\s*(\w+)\s*[,}]/.exec(pattern.slice(i));
          if (match) names.add(match[1]);
        }

        depth += 1;
      }

      return names;
    };

    const placeholders = (messages: Messages) => {
      const map = new Map<string, Set<string>>();

      const walk = (node: Messages, prefix = "") => {
        for (const [key, value] of Object.entries(node)) {
          const path = `${prefix}${key}`;
          if (typeof value === "object" && value !== null) {
            walk(value as Messages, `${path}.`);
          } else if (typeof value === "string") {
            const names = argumentNames(value);
            if (names.size > 0) map.set(path, names);
          }
        }
      };

      walk(messages);
      return map;
    };

    const enPlaceholders = placeholders(en as Messages);
    const mismatches: string[] = [];

    for (const [name, messages] of otherLocales) {
      const otherPlaceholders = placeholders(messages);

      for (const [path, names] of enPlaceholders) {
        const other = otherPlaceholders.get(path) ?? new Set<string>();
        const same =
          names.size === other.size && [...names].every((n) => other.has(n));

        if (!same) {
          mismatches.push(
            `${path}: en={${[...names].join(",")}} ${name}={${[...other].join(",")}}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("has balanced braces in every interpolated string", () => {
    const unbalanced: string[] = [];

    const walk = (node: Messages, prefix = "") => {
      for (const [key, value] of Object.entries(node)) {
        const path = `${prefix}${key}`;
        if (typeof value === "object" && value !== null) {
          walk(value as Messages, `${path}.`);
        } else if (typeof value === "string" && value.includes("{")) {
          const depth = [...value].reduce(
            (acc, char) => acc + (char === "{" ? 1 : char === "}" ? -1 : 0),
            0,
          );
          if (depth !== 0) unbalanced.push(path);
        }
      }
    };

    walk(en as Messages);
    for (const [, messages] of otherLocales) walk(messages);

    expect(unbalanced).toEqual([]);
  });
});

describe("keys referenced from source", () => {
  /** Every .ts/.tsx file outside node_modules and build output. */
  function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (["node_modules", ".next", ".git", "tests"].includes(entry)) continue;

      const path = join(dir, entry);

      if (statSync(path).isDirectory()) sourceFiles(path, found);
      else if (/\.tsx?$/.test(path)) found.push(path);
    }

    return found;
  }

  it("all resolve against en.json", () => {
    const known = new Set(enKeys);
    const missing: string[] = [];

    for (const file of sourceFiles(process.cwd())) {
      const source = readFileSync(file, "utf8");

      // Namespace bindings: const t = useTranslations("ns") and the
      // getTranslations equivalents, including destructured Promise.all.
      const namespaces = new Map<string, Set<string>>();
      const bind = (name: string, namespace: string) => {
        const set = namespaces.get(name) ?? new Set<string>();
        set.add(namespace);
        namespaces.set(name, set);
      };

      for (const m of source.matchAll(/(\w+)\s*=\s*useTranslations\("([^"]+)"\)/g)) {
        bind(m[1], m[2]);
      }
      for (const m of source.matchAll(
        /(\w+)\s*=\s*await\s+getTranslations\(\{[^}]*namespace:\s*"([^"]+)"/g,
      )) {
        bind(m[1], m[2]);
      }
      for (const m of source.matchAll(
        /const\s*\[\s*([\w,\s]+?)\s*\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\)/g,
      )) {
        const names = m[1].split(",").map((n) => n.trim());
        for (const call of m[2].matchAll(
          /getTranslations\((?:"([^"]+)"|\{[^}]*namespace:\s*"([^"]+)")/g,
        )) {
          for (const name of names) bind(name, call[1] ?? call[2]);
        }
      }

      for (const [name, spaces] of namespaces) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // Literal keys: t("some.key")
        for (const m of source.matchAll(
          new RegExp(`(?<![\\w.])${escaped}\\("([^"\`{}]+)"`, "g"),
        )) {
          if (![...spaces].some((ns) => known.has(`${ns}.${m[1]}`))) {
            missing.push(`${file}: ${[...spaces]}::${m[1]}`);
          }
        }

        // Template keys: t(`status.${value}`) — at least one key must
        // start with the static prefix.
        for (const m of source.matchAll(
          new RegExp(`(?<![\\w.])${escaped}\\(\`([^\`$]*)\\$\\{`, "g"),
        )) {
          const prefixes = [...spaces].map((ns) => `${ns}.${m[1]}`);
          if (!prefixes.some((p) => enKeys.some((k) => k.startsWith(p)))) {
            missing.push(`${file}: ${[...spaces]}::${m[1]}*`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
