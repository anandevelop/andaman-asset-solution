/**
 * tests/client-icon-props.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A server page may not hand a lucide icon *component* to a client
 * component — `icon: List` into <Segmented>, `icon={UserPlus}` into
 * <AdminDrawer>. A function cannot be serialised across that boundary, and
 * the page goes to its error boundary at request time.
 *
 * tsc passes it and so does every unit test: the type allows a component
 * (a client caller may pass one), and nothing renders the page. It took
 * the projects list down in round two of the v4 work, minutes after the
 * same mistake had been caught by hand in the sales-team drawer. A server
 * page passes an element instead: `icon: <List size={13} aria-hidden />`.
 *
 * Structural and deliberately narrow: only the client components that take
 * an icon prop, only inside their own JSX, only in server files.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}

/** Client components with an `icon` prop or item field. */
const CLIENT_ICON_TAKERS = ["Segmented", "AdminDrawer", "FilterChip"];

const isClient = (source: string) => /^\s*["']use client["']/.test(source);

/** `icon: Name,` / `icon: Name }` / `icon={Name}` — a bare identifier, not
 *  an element or an expression. */
const BARE_ICON = /icon(?::\s*|=\{)([A-Z][A-Za-z0-9]*)\s*[,}]/g;

function offenders(source: string): string[] {
  const found: string[] = [];
  for (const name of CLIENT_ICON_TAKERS) {
    let from = 0;
    for (;;) {
      const start = source.indexOf(`<${name}`, from);
      if (start === -1) break;
      // The element runs to its self-close or its opening tag's end; props
      // are what we want, so the first "/>" or ">\n" bounds it.
      const end = source.indexOf("/>", start);
      const props = source.slice(start, end === -1 ? undefined : end);
      for (const match of props.matchAll(BARE_ICON)) found.push(`<${name}> icon ${match[1]}`);
      from = start + 1;
    }
  }
  return found;
}

describe("server files pass icons to client components as elements", () => {
  const files = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "components"))].filter(
    (file) => !isClient(readFileSync(file, "utf8")),
  );

  it("finds the server files to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never passes a bare icon component", () => {
    const problems = files.flatMap((file) =>
      offenders(readFileSync(file, "utf8")).map((what) => `${relative(ROOT, file)}: ${what}`),
    );
    expect(problems).toEqual([]);
  });

  it("would catch the projects-page mistake", () => {
    const source = `<Segmented label="v" items={[{ key: "t", label: "T", icon: List, href: "/" }]} />`;
    expect(offenders(source)).toEqual(["<Segmented> icon List"]);
    expect(offenders(`<Segmented items={[{ key: "t", icon: <List size={13} /> }]} />`)).toEqual([]);
  });
});
