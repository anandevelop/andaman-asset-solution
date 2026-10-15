#!/usr/bin/env node
/**
 * scripts/prepare-3d-scene.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Readies a hand-modelled 3D site plan scene (public/embed/*-3d.html) for
 * the site. Run it on every new version of a scene file:
 *
 *   node scripts/prepare-3d-scene.mjs --from ~/Downloads/the-victory-3d.html public/embed/victory-3d.html
 *   node scripts/prepare-3d-scene.mjs public/embed/*-3d.html        (in place)
 *
 * What it changes:
 *
 *  1. three.js from our own server (invisible). The scenes are authored against
 *     cdnjs / jsdelivr; the CSP blocks both, and a CDN outage would take
 *     the 3D view down with it. URLs → /embed/vendor/three-r128/*.js.
 *
 *  2. No drawing while nobody can see it (invisible). The scenes redraw every frame
 *     with soft shadows, forever, including when the visitor has scrolled
 *     past or switched tabs — battery and heat on a phone for nothing. A
 *     small script ahead of the scene holds requestAnimationFrame while
 *     the frame is off-screen or the tab hidden, and releases it the
 *     moment it is back. The scenes clamp their frame delta (≤ 50 ms), so
 *     nothing jumps on resume.
 *
 *  3. Lighter on phones. Pixel ratio capped at 1.5 on touch screens
 *     (2 elsewhere, as authored): a 3× phone otherwise renders four times
 *     the pixels of 1.5× for a difference nobody sees on a 6-inch screen.
 *
 *  4. No common-area labels. The scenes pin a numbered label on each
 *     shared facility ("06 ครัว · ห้องอาหารกลางแจ้ง"); on the site they
 *     crowd the plot labels, so the list is emptied (`const POIS = []`).
 *     The facilities themselves are still modelled, just not labelled.
 *
 *  5. No security patrol car. The scenes drive a patrol car with a
 *     flashing beacon round the main road; it is never added to the
 *     scene (`scene.add(patrol)` dropped). The loop still moves it, out
 *     of sight, which costs nothing worth removing.
 *
 *  6. `?data=` same-origin only. The scenes can load plot statuses from
 *     a URL in their query string; left open, a link to
 *     /embed/x-3d.html?data=https://elsewhere would show another site's
 *     "statuses" on our domain. The site never uses it (statuses arrive by
 *     postMessage), so it is narrowed to our own origin.
 *
 * Idempotent: running it on an already-prepared file changes nothing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const VENDOR = "/embed/vendor/three-r128";
const MARK = "rp3d:perf-gate";

const GATE = `<script>/* ${MARK} — added by scripts/prepare-3d-scene.mjs */
(function () {
  var raf = window.requestAnimationFrame.bind(window), queue = [], inView = true;
  function live() { return inView && !document.hidden; }
  function resume() {
    if (!live() || !queue.length) return;
    var q = queue; queue = [];
    q.forEach(function (cb) { raf(cb); });
  }
  window.requestAnimationFrame = function (cb) {
    if (live()) return raf(cb);
    queue.push(cb);
    return 0;
  };
  document.addEventListener("visibilitychange", resume);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[entries.length - 1].isIntersecting;
      resume();
    }).observe(document.documentElement);
  }
})();
</script>
`;

function prepare(html) {
  const notes = [];
  let out = html
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/g, `${VENDOR}/three.min.js`)
    .replace(
      /https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/examples\/js\/(?:controls|utils|loaders)\/([A-Za-z]+\.js)/g,
      `${VENDOR}/$1`,
    );

  const foreign = [...out.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]);
  if (foreign.length) notes.push(`still loads from outside: ${foreign.join(", ")}`);
  for (const m of out.matchAll(/<script[^>]+src="\/embed\/vendor\/three-r128\/([^"]+)"/g)) {
    if (!existsSync(`public${VENDOR}/${m[1]}`)) notes.push(`missing public${VENDOR}/${m[1]}`);
  }

  if (!out.includes(MARK)) {
    const at = out.search(/<script[^>]*src="\/embed\/vendor\/three-r128\//);
    if (at === -1) notes.push("no three.js <script> found — gate not added");
    else out = out.slice(0, at) + GATE + out.slice(at);
  }

  const pr = /renderer\.setPixelRatio\(\s*Math\.min\(\s*devicePixelRatio\s*,\s*2\s*\)\s*\)/g;
  if (pr.test(out)) {
    out = out.replace(pr, 'renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia("(pointer: coarse)").matches ? 1.5 : 2))');
  } else if (!out.includes('matchMedia("(pointer: coarse)")')) {
    notes.push("setPixelRatio line not recognised — phone cap not applied");
  }
  if (/const POIS\s*=\s*LAND\.pois\s*;/.test(out)) {
    out = out.replace(/const POIS\s*=\s*LAND\.pois\s*;/, "const POIS = []; /* common-area labels off — scripts/prepare-3d-scene.mjs */");
  } else if (!/const POIS = \[\];/.test(out)) {
    notes.push("POIS list not recognised — common-area labels not removed");
  }

  const PATROL_OFF = "/* patrol car off — scripts/prepare-3d-scene.mjs */";
  if (/^\s*scene\.add\(patrol\);/m.test(out)) {
    out = out.replace(/^(\s*)scene\.add\(patrol\);/m, `$1${PATROL_OFF}`);
  } else if (!out.includes(PATROL_OFF) && /\bpatrol\b/.test(out)) {
    notes.push("scene.add(patrol) not recognised — patrol car not removed");
  }

  const DATA_OPEN = 'if(Q.get("data")) fetch(Q.get("data")';
  const DATA_SAFE =
    'if(Q.get("data") && new URL(Q.get("data"), location.href).origin === location.origin) fetch(Q.get("data")';
  if (out.includes(DATA_OPEN)) out = out.replace(DATA_OPEN, DATA_SAFE);
  else if (out.includes('Q.get("data")') && !out.includes(DATA_SAFE)) {
    notes.push("?data= loader not recognised — not narrowed to same origin");
  }

  return { out, notes };
}

// prepare-3d-scene.mjs --from <new.html> <public/embed/x-3d.html>   copy a new version in
// prepare-3d-scene.mjs <file.html>...                                  prepare in place
const args = process.argv.slice(2);
let pairs;
if (args[0] === "--from" && args.length === 3) pairs = [[args[1], args[2]]];
else if (args.length && !args.includes("--from")) pairs = args.map((f) => [f, f]);
else {
  console.error("usage: prepare-3d-scene.mjs --from <new.html> <dest.html>  |  prepare-3d-scene.mjs <file.html>...");
  process.exit(1);
}

let failed = false;
for (const [src, dest] of pairs) {
  const { out, notes } = prepare(readFileSync(src, "utf8"));
  writeFileSync(dest, out);
  console.log(`✓ ${dest}`);
  for (const n of notes) {
    console.log(`  ! ${n}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
