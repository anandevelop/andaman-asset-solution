/**
 * tests/client-server-only.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A "use client" component may not reach a module marked `server-only`,
 * however many hops away it is.
 *
 * Same shape of trap as tests/use-server-exports.test.ts next door: valid
 * TypeScript, clean `tsc`, clean `next lint`, and then the route 500s at
 * request time with "You're importing a component that needs server-only".
 * It cost the SEO tab one build — PageSeoEditor pulled SEO_LIMITS out of
 * lib/admin/page-seo.ts, which is server-only because it queries Prisma,
 * and the whole page stopped rendering. lib/seo-limits.ts exists to hold
 * that constant on the safe side of the line.
 *
 * Transitive, because that is how it will happen next time: nobody imports
 * a server-only file from a client component directly — they import a
 * helper that seemed innocent, and the helper imports one.
 *
 * Structural, reading source instead of importing it, for the same reason
 * the sibling test is: these modules boot Prisma and next/headers.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ROOTS = ["app", "lib", "components"].map((dir) => join(ROOT, dir));

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const read = (file: string) => readFileSync(file, "utf8");

const ALL = ROOTS.flatMap((root) => sourceFiles(root));

const isClientFile = (file: string) => {
  const head = read(file).trimStart();
  return head.startsWith('"use client"') || head.startsWith("'use client'");
};

const isServerOnly = (file: string) => /^import\s+["']server-only["'];?$/m.test(read(file));

/**
 * A "use server" module is a boundary, not a hop. Next replaces it with an
 * RPC stub in the client bundle, so what it imports — Prisma, the admin
 * guard, next/headers — never crosses over. Every client component in this
 * codebase imports one, and walking through them would report all of them.
 */
const isServerAction = (file: string) => {
  const head = read(file).trimStart();
  return head.startsWith('"use server"') || head.startsWith("'use server'");
};

/** `@/lib/foo` → the file it resolves to, or null for a package import. */
function resolveLocal(specifier: string): string | null {
  if (!specifier.startsWith("@/")) return null;

  const base = join(ROOT, specifier.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Every `@/…` module a file imports at runtime — static, dynamic, and
 * re-exported. `import type` / `export type` are left out: they are erased
 * before the bundler sees them, which is exactly how lib/validations.ts
 * names a SettingKey from the server-only settings module without pulling
 * it into the browser.
 */
function localImports(file: string): string[] {
  const source = read(file);

  /*
    The body between the keyword and the specifier may run over several
    lines but may not contain a quote or a semicolon — that is what stops
    one statement's match from running on into the next statement's
    specifier and reporting an import nobody wrote.
  */
  const statements = [
    ...source.matchAll(/(?:^|\n)\s*(?:import|export)(\s+type\b)?\s+(?:[^;'"]*?\bfrom\s+)?["'](@\/[^"']+)["']/g),
  ]
    .filter((match) => match[1] === undefined)
    .map((match) => match[2]);

  const dynamic = [...source.matchAll(/\bimport\s*\(\s*["'](@\/[^"']+)["']/g)].map((match) => match[1]);

  return [...new Set([...statements, ...dynamic])]
    .map(resolveLocal)
    .filter((path): path is string => path !== null);
}

/**
 * The chain from a client component to a server-only module, or null.
 * Breadth-first so the reported path is the shortest one, which is the
 * one worth reading.
 */
function pathToServerOnly(entry: string): string[] | null {
  const seen = new Set([entry]);
  const queue: string[][] = [[entry]];

  while (queue.length > 0) {
    const chain = queue.shift()!;
    for (const next of localImports(chain[chain.length - 1])) {
      if (seen.has(next)) continue;
      seen.add(next);

      if (isServerAction(next)) continue;

      const extended = [...chain, next];
      if (isServerOnly(next)) return extended;

      // A nested "use client" module is still client code — keep walking.
      queue.push(extended);
    }
  }
  return null;
}

describe("client components", () => {
  const clientFiles = ALL.filter(isClientFile);

  it("finds the client components it is supposed to be checking", () => {
    expect(clientFiles.length).toBeGreaterThan(20);
  });

  it("finds the server-only modules it is supposed to be checking", () => {
    expect(ALL.filter(isServerOnly).length).toBeGreaterThan(5);
  });

  it("never reach a server-only module", () => {
    const offenders = clientFiles
      .map((file) => pathToServerOnly(file))
      .filter((chain): chain is string[] => chain !== null)
      .map((chain) => chain.map((file) => relative(ROOT, file)).join(" → "));

    expect(offenders).toEqual([]);
  });
});
