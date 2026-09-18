/**
 * tests/use-server-exports.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A "use server" module may export only async functions. Export a const, a
 * type-erased object, or a plain function and Next refuses to compile the
 * whole route — at request time, with a message that names the export but
 * not the page it took down.
 *
 * `tsc` cannot see this: every one of those exports is valid TypeScript.
 * It has already cost two outages in this codebase — the Publishing
 * dashboard, whose actions file exported a type guard, and the project
 * content editor, whose actions file exported its field list — and in both
 * cases the page simply stopped rendering with nothing failing in CI.
 *
 * Structural, reading source rather than importing it: these files pull in
 * Prisma and next/headers, which a unit test has no business booting. Same
 * reasoning as tests/offline-notice.test.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = [join(process.cwd(), "app"), join(process.cwd(), "lib"), join(process.cwd(), "components")];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const read = (file: string) => readFileSync(file, "utf8");

/** Files whose first statement is the "use server" directive. */
const serverActionFiles = ROOTS.flatMap((root) => sourceFiles(root)).filter((file) => {
  const head = read(file).trimStart();
  return head.startsWith('"use server"') || head.startsWith("'use server'");
});

/*
  `export type` and `export interface` are erased before Next ever sees the
  module, so they are allowed — and every actions file in this codebase uses
  them for its result shapes. Everything else in an export position is not.
*/
const FORBIDDEN = /^export\s+(?!async\s+function\b)(?!type\b)(?!interface\b)(const|let|var|function|class|enum)\b/;

describe("use server modules", () => {
  it("finds the action files it is supposed to be checking", () => {
    expect(serverActionFiles.length).toBeGreaterThan(5);
  });

  it("export only async functions", () => {
    const offenders: string[] = [];

    for (const file of serverActionFiles) {
      read(file)
        .split("\n")
        .forEach((line, index) => {
          if (FORBIDDEN.test(line.trim())) {
            offenders.push(`${relative(process.cwd(), file)}:${index + 1} — ${line.trim().slice(0, 72)}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
