/**
 * scripts/copy-pdfjs-assets.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Copy pdf.js out of node_modules and into public/, so the browser loads
 * both the library and its worker from our own origin, untouched by the
 * bundler.
 *
 * Two separate reasons, and both were learned the hard way:
 *
 *   1. **The bundler cannot be allowed to process pdf.mjs.** It is itself
 *      a webpack bundle, complete with its own `__webpack_require__`
 *      runtime. Nesting that inside Next's webpack makes the two runtimes
 *      collide, and importing the package throws `TypeError:
 *      Object.defineProperty called on non-object` before a single line of
 *      pdf.js runs. The legacy build fails the same way. Serving the file
 *      as a static asset and importing it with `webpackIgnore` sidesteps
 *      the bundler entirely — the browser does a plain ESM import of a
 *      same-origin URL, which `script-src 'self'` already allows.
 *
 *   2. **The worker has to be same-origin.** Given a cross-origin
 *      workerSrc, pdf.js does not fail — it fetches the worker's source
 *      and re-hosts it from a `blob:` URL (_createCDNWrapper in
 *      pdfjs-dist/build/pdf.mjs). Our CSP declares `worker-src 'self'`
 *      with no blob:, so that path is refused the moment CSP_ENFORCE=true,
 *      and the symptom is a spinner that never resolves with nothing in
 *      any server log.
 *
 * The path carries no version segment, because the library is imported
 * from it — there is nowhere to read a version from before the import has
 * happened. That is safe here: Next serves public/ with
 * `must-revalidate` rather than the immutable caching it gives
 * /_next/static, so a changed file is picked up. This directory is wiped
 * and rewritten on every install and build, so its contents always match
 * the pinned pdfjs-dist.
 *
 * Wired to postinstall, predev and prebuild. Each covers a different gap —
 * a fresh clone, a dev server started without reinstalling, and the Docker
 * build, where the deps stage's node_modules is carried forward but its
 * public/ is not (see the builder stage in the Dockerfile).
 *
 * Plain Node, no dependencies: it runs during `npm ci` before anything is
 * built, so it cannot import from the app.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "node_modules", "pdfjs-dist");
const DESTINATION_ROOT = join(ROOT, "public", "pdfjs");

/**
 * What the viewer actually asks for.
 *
 *   pdf.min.mjs         the library, imported by the browser directly
 *   pdf.worker.min.mjs  the worker itself
 *   cmaps/              character maps for CJK text — a Chinese brochure
 *                       renders as blank boxes without them, which matters
 *                       on a site that ships zh
 *   standard_fonts/     the 14 PDF base fonts, for files that assume the
 *                       reader has them rather than embedding
 *   wasm/               JPEG 2000 / JBIG2 decoders
 *   iccs/               colour profiles
 */
const ASSETS = [
  "build/pdf.min.mjs",
  "build/pdf.worker.min.mjs",
  "cmaps",
  "standard_fonts",
  "wasm",
  "iccs",
];

function main() {
  if (!existsSync(SOURCE)) {
    // Not fatal: `npm ci --omit=dev` or a partial install can reach here,
    // and failing the install over an asset copy would be worse than the
    // 404 the viewer would otherwise show.
    console.warn("[pdfjs] pdfjs-dist is not installed — skipping asset copy");
    return;
  }

  const { version } = JSON.parse(
    readFileSync(join(SOURCE, "package.json"), "utf8"),
  );

  mkdirSync(DESTINATION_ROOT, { recursive: true });

  /*
    Clear anything left from a previous pdfjs-dist, so an upgrade cannot
    leave a stale worker beside a new library.

    Best-effort per entry rather than a wipe of the whole directory: doing
    that inside a bind-mounted volume fails with ENOTEMPTY or EACCES often
    enough to matter, and this runs as postinstall, where throwing would
    fail `npm ci` and take the entire CI pipeline with it. Leaving a stale
    file behind costs disk; failing the install costs the build. The copy
    below is the part that is allowed to throw.
  */
  for (const entry of readdirSync(DESTINATION_ROOT)) {
    try {
      rmSync(join(DESTINATION_ROOT, entry), { recursive: true, force: true });
    } catch (error) {
      console.warn(`[pdfjs] could not remove stale ${entry}: ${error.message}`);
    }
  }

  for (const asset of ASSETS) {
    const from = join(SOURCE, asset);

    if (!existsSync(from)) {
      console.warn(`[pdfjs] ${asset} is missing from pdfjs-dist@${version}`);
      continue;
    }

    // basename, so build/pdf.worker.min.mjs lands at the root of the
    // directory rather than under a build/ segment the client would have
    // to know about.
    cpSync(from, join(DESTINATION_ROOT, asset.split("/").pop()), {
      recursive: true,
    });
  }

  console.log(`[pdfjs] copied pdfjs-dist@${version} assets to public/pdfjs/`);
}

main();
