#!/usr/bin/env node
/**
 * scripts/admin-class-sweep.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Replaces the public site's colour utilities (text-ink, bg-surface-muted,
 * text-red-700 …) with the back office's own tokens (text-adm-text,
 * bg-adm-text/4, text-adm-danger …) inside the admin only.
 *
 * Why the admin needs its own: the public palette has one theme, the
 * admin has two. text-ink is near-black in both, so every legacy class
 * left in the admin is a word that disappears in dark mode — and the v4
 * screens mixed both vocabularies, which is also why two cards on one
 * page could be two different greys.
 *
 *   node scripts/admin-class-sweep.mjs            dry run: counts per file
 *   node scripts/admin-class-sweep.mjs --write    apply
 *
 * Scope is app/[locale]/admin and components/admin, minus the files the
 * login page renders: the adm-* tokens only exist under [data-admin-root]
 * (globals.css), and /login is outside it.
 *
 * Deliberately left alone:
 *  · text-white and bg-white/<n> — they sit on the navy band, the sand
 *    button or a photo, which are the same in both themes;
 *  · the files in EXCLUDE below;
 *  · colours handed to a chart library as literals (DashboardCharts,
 *    AnalyticsTabs …) — those are hex strings, not classes, and this
 *    script only rewrites class tokens.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");

/** LoginForm and AuthProvider are rendered by app/[locale]/login, outside
 *  the admin root, where no adm token exists. SerpPreview imitates a
 *  Google result, white page and Google's own colours, in both themes. */
const EXCLUDE = new Set([
  "components/admin/LoginForm.tsx",
  "components/admin/AuthProvider.tsx",
  "components/admin/seo/SerpPreview.tsx",
]);

/*
  [pattern, replacement]. Each pattern matches a whole utility (optionally
  with an /opacity modifier, captured as $1) at a class-token boundary, so
  variants before it — hover:, focus:, sm: — are kept as they are.
  Order matters: longer names before their prefixes.
*/
const B = String.raw`(?<=^|[\s"'\`:{(])`;
const E = String.raw`(?=$|[\s"'\`)}!])`;
const OP = String.raw`(\/\d{1,3})?`;
const RULES = [
  [`text-ink-muted${OP}`, "text-adm-muted$1"],
  [`text-ink${OP}`, "text-adm-text$1"],
  [`bg-ink${OP}`, "bg-adm-text$1"],
  [`border-ink${OP}`, "border-adm-text$1"],

  [`bg-surface-muted${OP}`, "bg-adm-text/4"],
  [`bg-surface-raised${OP}`, "bg-adm-solid$1"],
  [`bg-surface${OP}`, "bg-adm-bg$1"],
  [`bg-white`, "bg-adm-solid"],
  [`bg-(?:slate|gray)-(?:50|100)`, "bg-adm-text/4"],
  [`border-(?:slate|gray)-(?:100|200)`, "border-adm-line"],
  [`border-(?:slate|gray)-300`, "border-adm-line-strong"],
  [`text-(?:slate|gray)-(?:400|500|600|700)`, "text-adm-muted"],

  [`text-(?:red|rose)-(?:500|600|700|800|900)`, "text-adm-danger"],
  [`bg-(?:red|rose)-(?:50|100)`, "bg-adm-danger-bg"],
  [`bg-(?:red|rose)-(?:500|600)`, "bg-adm-danger"],
  [`border-(?:red|rose)-(?:100|200|300|400)`, "border-adm-danger/30"],

  [`text-(?:amber|yellow)-(?:500|600|700|800|900)`, "text-adm-warning"],
  [`bg-(?:amber|yellow)-(?:50|100)`, "bg-adm-warning-bg"],
  [`bg-(?:amber|yellow)-(?:400|500|600)`, "bg-adm-warning"],
  [`border-(?:amber|yellow)-(?:100|200|300|400)`, "border-adm-warning/30"],

  [`text-(?:emerald|green)-(?:500|600|700|800|900)`, "text-adm-success"],
  [`bg-(?:emerald|green)-(?:50|100)`, "bg-adm-success-bg"],
  [`bg-(?:emerald|green)-(?:400|500|600)`, "bg-adm-success"],
  [`border-(?:emerald|green)-(?:100|200|300|400)`, "border-adm-success/30"],

  /* The brand pair as page colours: navy text, navy-tinted lines and
     wells, sand ink. Solid bg-primary (a navy button with text-white
     beside it) is left: its text has to change with it, as a pair. */
  [`text-primary-(?:400|500|600|700)`, "text-adm-info"],
  [`text-primary`, "text-adm-text"],
  [`border-primary\/(?:5|10)`, "border-adm-line"],
  [`border-primary\/(?:15|20|25|30|40)`, "border-adm-line-strong"],
  [`border-primary`, "border-adm-text"],
  [`divide-primary\/(?:5|10|15)`, "divide-adm-line"],
  [`bg-primary-900\/([0-9]{1,2})`, "bg-adm-text/$1"],
  [`bg-primary\/(5|10|15|20)`, "bg-adm-text/$1"],
  [`ring-primary\/([0-9]{1,2})`, "ring-adm-info/$1"],
  [`text-accent-(?:600|700|800|900)`, "text-adm-accent-ink"],
  [`bg-accent-50${OP}`, "bg-adm-fill/15"],
  [`bg-accent\/([0-9]{1,2})`, "bg-adm-fill/$1"],
  [`border-accent\/([0-9]{1,2})`, "border-adm-fill/$1"],
  [`bg-accent`, "bg-adm-fill"],
  [`border-accent`, "border-adm-fill"],
  [`ring-accent`, "ring-adm-fill"],

  [`text-(?:sky|blue)-(?:500|600|700|800|900)`, "text-adm-status-info"],
  [`bg-(?:sky|blue)-(?:50|100)`, "bg-adm-status-info-bg"],
  [`border-(?:sky|blue)-(?:100|200|300)`, "border-adm-status-info/30"],
].map(([pattern, replacement]) => [new RegExp(`${B}${pattern}${E}`, "g"), replacement]);

function files(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const targets = [...files(join(ROOT, "app/[locale]/admin")), ...files(join(ROOT, "components/admin"))].filter(
  (file) => !EXCLUDE.has(relative(ROOT, file)),
);

let total = 0;
for (const file of targets) {
  const before = readFileSync(file, "utf8");
  let after = before;
  let count = 0;
  for (const [regex, replacement] of RULES) {
    after = after.replace(regex, (...match) => {
      count += 1;
      const opacity = match[1];
      return replacement.replace("$1", typeof opacity === "string" ? opacity : "");
    });
  }
  /*
    Solid navy (bg-primary) as a pair: the strong surface is navy in light
    and sand in dark, so its text has to flip with it — text-white beside
    it in the same class string becomes text-adm-on-strong. A bg-primary
    with no text-white beside it (a dot, a bar) takes the surface alone.
  */
  after = after.replace(/(["'`])([^"'`\n]*?)\1/g, (whole, quote, body) => {
    if (!/(^|[\s:])bg-primary(?=$|[\s])/.test(body)) return whole;
    count += 1;
    const next = body
      .replace(/(^|[\s:])bg-primary(?=$|[\s])/g, "$1bg-adm-strong")
      .replace(/(^|[\s:])text-white(?=$|[\s])/g, "$1text-adm-on-strong");
    return `${quote}${next}${quote}`;
  });

  if (count === 0) continue;
  total += count;
  console.log(`${String(count).padStart(4)}  ${relative(ROOT, file)}`);
  if (WRITE) writeFileSync(file, after);
}
console.log(`${WRITE ? "rewrote" : "would rewrite"} ${total} class tokens`);
