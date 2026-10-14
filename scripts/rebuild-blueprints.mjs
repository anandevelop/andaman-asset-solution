/**
 * scripts/rebuild-blueprints.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Re-derive every floor plan's blueprint (the transparent line drawing the
 * unit-types section shows on navy) from the drawing it already has, after
 * a fix to lib/floor-plan-images.ts. Without it, a fixed transform only
 * reaches drawings uploaded after the deploy.
 *
 * The work is done by POST /api/cron/rebuild-blueprints inside the running
 * app — which already has the database, the bucket credentials and sharp —
 * so this script is node built-ins only, like scripts/cron.mjs, and runs in
 * the production image as it is:
 *
 *   docker compose -f docker-compose.prod.yml exec app node scripts/rebuild-blueprints.mjs
 *   …                                                   … --dry-run
 *   …                                                   … --project residence-prime
 *
 * Locally (npm run dev in another terminal):
 *
 *   node scripts/rebuild-blueprints.mjs --dry-run
 *
 * Reads CRON_SECRET from the environment, or from .env when run from the
 * repo. Target: --url, else REBUILD_TARGET_URL, else http://127.0.0.1:$PORT.
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";

function arg(flag) {
  const index = process.argv.indexOf(`--${flag}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Same minimal loader as scripts/spaces-runtime.ts — no dotenv dependency. */
function loadEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("❌ CRON_SECRET is not set. It is the same secret the scheduler uses.");
  process.exit(1);
}

const base = arg("url") ?? process.env.REBUILD_TARGET_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const dryRun = process.argv.includes("--dry-run");
const project = arg("project");

const url = new URL("/api/cron/rebuild-blueprints", base);
if (dryRun) url.searchParams.set("dryRun", "1");
if (project) url.searchParams.set("project", project);

console.log(`\n  ${dryRun ? "Dry run — nothing will change" : "Rebuilding floor-plan blueprints"}${project ? ` (${project})` : ""}`);
console.log(`  → ${url.origin}${url.pathname}\n`);

let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10 * 60_000),
  });
} catch (error) {
  console.error(`❌ Could not reach the app at ${url.origin}: ${error.message}`);
  process.exit(1);
}

const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  console.error(`❌ ${response.status}: ${text.slice(0, 300)}`);
  process.exit(1);
}

if (!response.ok && !Array.isArray(body.floors)) {
  console.error(`❌ ${response.status}: ${body.error ?? text.slice(0, 300)}`);
  process.exit(1);
}

const mark = { rebuilt: "✓", "would-rebuild": "•", skipped: "–", failed: "✗" };
for (const floor of body.floors) {
  const reason = floor.reason ? `  (${floor.reason})` : "";
  console.log(`  ${mark[floor.status] ?? "?"} ${floor.project} · ${floor.unitType} · ${floor.floor}${reason}`);
}

console.log(
  `\n  ${body.total} floors: ` +
    (dryRun
      ? `${body.wouldRebuild} would be rebuilt, ${body.skipped} skipped`
      : `${body.rebuilt} rebuilt, ${body.skipped} skipped, ${body.failed} failed`) +
    "\n",
);

process.exit(body.failed > 0 ? 1 : 0);
