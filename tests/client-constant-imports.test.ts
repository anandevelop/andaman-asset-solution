/**
 * tests/client-constant-imports.test.ts
 *
 * A server file may import components from a "use client" module, but not
 * plain values to use itself: it receives a client reference, not the value.
 * /admin/analytics shipped `ANALYTICS_RANGES.includes(...)` on a constant
 * imported that way and crashed on every visit. Constants and helpers belong
 * in a plain module under lib/.
 *
 * Covers both "@/…" and relative imports, client modules ending in .ts as
 * well as .tsx, and every value name that is not a component (PascalCase)
 * or a type — SCREAMING_CASE constants and camelCase functions alike.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/** Every file under `dir` whose name matches `ext` (node:fs globSync is not in this @types/node). */
function files(dir: string, ext: RegExp, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(path, ext, found);
    else if (ext.test(entry.name)) found.push(path);
  }
  return found;
}

const isClient = (source: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(source);

/** "@/lib/x" or "./x" from `importer` → the file it names, if it exists. */
function resolve(spec: string, importer: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? join(dirname(importer), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    const file = normalize(candidate);
    if (/\.tsx?$/.test(file) && existsSync(file)) return file;
  }
  return null;
}

/* Passed straight back into a client component as a prop, where the
   reference resolves to the value — not read on the server. */
const ALLOWED = new Set(["EMPTY_BROCHURE"]);

const SOURCES = ["app", "components", "lib"].flatMap((dir) => files(dir, /\.tsx?$/));

describe("server files import no values from client modules", () => {
  const clientFiles = new Set(SOURCES.filter((file) => isClient(readFileSync(file, "utf8"))).map((f) => normalize(f)));

  it("finds the client modules it is meant to check", () => {
    expect(clientFiles.size).toBeGreaterThan(50);
  });

  it("finds none", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(file, "utf8");
      if (isClient(source)) continue;
      for (const match of source.matchAll(/import\s+(?!type\b)(?:\w+\s*,\s*)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
        const target = resolve(match[2], file);
        if (!target || !clientFiles.has(target)) continue;
        for (const raw of match[1].split(",").map((n) => n.trim()).filter(Boolean)) {
          if (raw.startsWith("type ")) continue;
          const name = raw.split(/\s+as\s+/)[0];
          if (/^[A-Z][a-z]/.test(name) || ALLOWED.has(name)) continue; // a component
          offenders.push(`${file}: ${name} from ${match[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
