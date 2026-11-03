/**
 * tests/client-constant-imports.test.ts
 *
 * A server file may import components from a "use client" module, but not
 * plain values to use itself: it receives a client reference, not the value.
 * /admin/analytics shipped `ANALYTICS_RANGES.includes(...)` on a constant
 * imported that way and crashed on every visit. Constants (SCREAMING_CASE)
 * belong in a plain module under lib/.
 */

import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const isClient = (source: string) => /^\s*["']use client["']/.test(source);

/* Passed straight back into a client component as a prop, where the
   reference resolves to the value — not read on the server. */
const ALLOWED = new Set(["EMPTY_BROCHURE"]);

describe("server files import no constants from client modules", () => {
  it("finds none", () => {
    const clientFiles = new Set(
      [...globSync("components/**/*.tsx"), ...globSync("app/**/*.tsx")].filter((file) =>
        isClient(readFileSync(file, "utf8")),
      ),
    );
    const offenders: string[] = [];
    for (const file of [...globSync("app/**/*.{ts,tsx}"), ...globSync("lib/**/*.{ts,tsx}")]) {
      const source = readFileSync(file, "utf8");
      if (isClient(source)) continue;
      for (const match of source.matchAll(/import\s+(?:\w+\s*,\s*)?\{([^}]*)\}\s+from\s+"@\/([^"]+)"/g)) {
        if (!clientFiles.has(`${match[2]}.tsx`)) continue;
        for (const name of match[1].split(",").map((n) => n.trim())) {
          if (/^[A-Z][A-Z0-9_]+$/.test(name) && !ALLOWED.has(name)) offenders.push(`${file}: ${name} from ${match[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
