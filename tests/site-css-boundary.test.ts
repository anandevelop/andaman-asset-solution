/**
 * tests/site-css-boundary.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * app/site.css is the public site's stylesheet, and it tells Tailwind not
 * to look for class names in the back office's directories (`@source not`).
 * That is only right while no public page renders a component from them.
 *
 * Break it and nothing fails: the build passes, the page renders, and one
 * component on the public site simply has no styles. So this follows the
 * imports from every file a public route can render and fails on the first
 * one that lands in an excluded directory with markup in it.
 *
 * The fix, when it fails, is one of: move the component out of the admin
 * directory, or stop the public page importing it. Not: delete the
 * `@source not` line — that puts the whole back office's CSS back in front
 * of every visitor's first paint.
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

/** The directories site.css excludes, as paths from the repository root. */
function excludedDirectories(): string[] {
  const css = read("app/site.css");
  return [...css.matchAll(/^@source not "([^"]+)";$/gm)].map((match) =>
    path.posix.normalize(path.posix.join("app", match[1])),
  );
}

function walk(directory: string): string[] {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const CODE = /\.(tsx?|jsx?)$/;
const SUFFIXES = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(from), specifier);
  else return null;
  for (const suffix of SUFFIXES) {
    const candidate = path.posix.normalize(base + suffix);
    const absolute = path.join(ROOT, candidate);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) return candidate;
  }
  return null;
}

/** Static, re-exported, dynamic and side-effect imports; `import type` is
 *  skipped, since a type never reaches the page. */
const IMPORT =
  /(?:import|export)\s+(type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

/** Every file reachable from `entries`, mapped to the file that imported it. */
function reachable(entries: string[]): Map<string, string | null> {
  const seen = new Map<string, string | null>();
  const queue: [string, string | null][] = entries.map((entry) => [entry, null]);
  while (queue.length > 0) {
    const [file, parent] = queue.pop()!;
    if (seen.has(file)) continue;
    seen.set(file, parent);
    if (!CODE.test(file)) continue;
    for (const match of read(file).matchAll(IMPORT)) {
      if (match[1]) continue;
      const target = resolveImport(file, match[2] ?? match[3] ?? match[4]);
      if (target) queue.push([target, file]);
    }
  }
  return seen;
}

const excluded = excludedDirectories();
const isExcluded = (file: string) => excluded.some((directory) => file.startsWith(`${directory}/`));

/** Everything under app/ that is not the back office, the sign-in page or
 *  an API route: the files a visitor's page is built from. */
const publicEntries = walk("app").filter(
  (file) => CODE.test(file) && !isExcluded(file) && !file.startsWith("app/api/"),
);

describe("the public stylesheet's boundary", () => {
  it("excludes the back office's directories, and they exist", () => {
    expect(excluded).toEqual(
      expect.arrayContaining(["components/admin", "app/[locale]/admin", "app/[locale]/login", "lib/admin"]),
    );
    for (const directory of excluded) {
      expect(fs.existsSync(path.join(ROOT, directory)), directory).toBe(true);
    }
  });

  it("no public page renders markup from an excluded directory", () => {
    const graph = reachable(publicEntries);
    // Sanity: the walk really did follow the public site's imports.
    expect(graph.has("components/Navbar.tsx")).toBe(true);
    expect(graph.has("components/LeadForm.tsx")).toBe(true);

    const offenders = [...graph.keys()]
      .filter(isExcluded)
      // A plain .ts module with no class names (a guard, a constant) is
      // harmless: there is nothing in it for Tailwind to have found.
      .filter((file) => /\.[jt]sx$/.test(file) || /className|class=/.test(read(file)))
      .map((file) => {
        const chain = [file];
        for (let parent = graph.get(file); parent; parent = graph.get(parent)) chain.push(parent);
        return chain.join("  ←  ");
      });

    expect(offenders).toEqual([]);
  });

  it("each route family imports exactly one stylesheet", () => {
    const stylesheets = (file: string) =>
      [...read(file).matchAll(/^import "([^"]+\.css)";$/gm)].map((match) => path.posix.basename(match[1]));

    // The shared layout must stay empty-handed: a stylesheet imported there
    // reaches every route, which is the thing this split undid.
    expect(stylesheets("app/[locale]/layout.tsx")).toEqual([]);

    expect(stylesheets("app/[locale]/(site)/layout.tsx")).toEqual(["site.css"]);
    expect(stylesheets("app/[locale]/not-found.tsx")).toEqual(["site.css"]);
    expect(stylesheets("app/[locale]/error.tsx")).toEqual(["site.css"]);
    expect(stylesheets("app/[locale]/[...rest]/page.tsx")).toEqual(["site.css"]);

    expect(stylesheets("app/[locale]/admin/layout.tsx")).toEqual(["globals.css"]);
    expect(stylesheets("app/[locale]/login/page.tsx")).toEqual(["globals.css"]);
  });

  it("the two stylesheets share their parts, in the same order", () => {
    const parts = (file: string) => [...read(file).matchAll(/^@import "([^"]+)";$/gm)].map((match) => match[1]);
    expect(parts("app/globals.css")).toEqual([
      "tailwindcss",
      "./styles/shared.css",
      "./styles/back-office.css",
      "./styles/shared-late.css",
    ]);
    expect(parts("app/site.css")).toEqual(["tailwindcss", "./styles/shared.css", "./styles/shared-late.css"]);
  });
});
