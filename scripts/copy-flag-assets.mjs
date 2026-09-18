/**
 * scripts/copy-flag-assets.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Copy the flag-icons SVGs out of node_modules and into public/flags/, so
 * CountrySelect.tsx can reference them as plain same-origin <img> tags
 * (`/flags/th.svg`) instead of importing from node_modules — Next does not
 * serve arbitrary node_modules paths to the browser, and copying is the
 * same trade lib/pdf-render.ts's worker makes for the same reason (see
 * copy-pdfjs-assets.mjs).
 *
 * Real SVG files, not emoji: Windows renders the Unicode regional-indicator
 * flag emoji as two-letter text ("TH") on a large share of desktops
 * (Segoe UI Emoji ships no flag glyphs at all pre-Windows 11 24H2, and many
 * enterprise images still lack them), which is exactly what CountrySelect
 * exists to avoid on a form international buyers are filling in.
 *
 * Wired to the same three hooks as copy-pdfjs-assets.mjs and for the same
 * reasons — a fresh clone, `next dev` started without reinstalling, and
 * the Docker build's carried-forward node_modules with a fresh public/.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "node_modules", "flag-icons", "flags", "4x3");
const DESTINATION = join(ROOT, "public", "flags");

function main() {
  if (!existsSync(SOURCE)) {
    // Not fatal — same reasoning as copy-pdfjs-assets.mjs: a partial
    // install reaching here must not fail `npm ci` over a flag icon.
    console.warn("[flags] flag-icons is not installed — skipping asset copy");
    return;
  }

  // Wipe first so a version bump that drops or renames a flag cannot
  // leave a stale SVG for a code CountrySelect no longer expects.
  rmSync(DESTINATION, { recursive: true, force: true });
  mkdirSync(DESTINATION, { recursive: true });

  cpSync(SOURCE, DESTINATION, { recursive: true });

  console.log("[flags] copied flag-icons SVGs to public/flags/");
}

main();
