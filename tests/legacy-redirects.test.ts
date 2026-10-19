import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n";

/*
  config/legacy-redirects.js maps the old WordPress URLs onto this app at
  cutover. A destination that names a route that does not exist turns a
  ranked URL into a 404 one hop later, which is worse than no redirect: it
  looks handled. These check every destination against app/[locale]/(site).
*/

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { legacyRedirects } = require("../config/legacy-redirects.js") as {
  legacyRedirects: { source: string; destination: string; permanent: boolean }[];
};

const SITE = path.join(process.cwd(), "app", "[locale]", "(site)");

function routeExists(destination: string): boolean {
  const [, locale, ...segments] = destination.split("/");
  if (!(locales as readonly string[]).includes(locale)) return false;
  let dir = SITE;
  for (const segment of segments) {
    if (!segment) continue;
    const literal = path.join(dir, segment);
    if (segment.startsWith(":")) {
      // A :param destination needs a [param] route at this level.
      const dynamic = path.join(dir, `[${segment.slice(1)}]`);
      if (!existsSync(dynamic)) return false;
      dir = dynamic;
    } else if (existsSync(literal)) {
      dir = literal;
    } else {
      // A project slug: served by the [slug] route beside it.
      const dynamic = readdirSync(dir).find((name) => /^\[[^.\]]+\]$/.test(name));
      if (!dynamic) return false;
      dir = path.join(dir, dynamic);
    }
  }
  return existsSync(path.join(dir, "page.tsx"));
}

describe("legacy WordPress redirects", () => {
  it("are all permanent", () => {
    expect(legacyRedirects.filter((r) => !r.permanent)).toEqual([]);
  });

  it("all land on a public route that exists", () => {
    expect(legacyRedirects.filter((r) => !routeExists(r.destination)).map((r) => r.destination)).toEqual([]);
  });

  it("never claim a path this app serves itself", () => {
    // A source under a locale, or one ending in "/", would either shadow a
    // real page or never match (Next strips the slash first).
    const own = legacyRedirects.filter(
      (r) => (locales as readonly string[]).some((l) => r.source === `/${l}` || r.source.startsWith(`/${l}/`)) || r.source.endsWith("/"),
    );
    expect(own).toEqual([]);
  });

  it("are listed once each", () => {
    const sources = legacyRedirects.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("are wired into next.config.js ahead of everything else", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.js"), "utf8");
    expect(config).toMatch(/async redirects\(\) \{\s+return \[\s+\/\/[^\n]*\n\s+\.\.\.legacyRedirects,/);
  });
});
