/**
 * scripts/spaces-runtime.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Shared plumbing for the Spaces scripts: read .env, then get at lib/s3.ts
 * from a plain node process.
 *
 * Both of those are small but easy to get subtly wrong, and a copy of them
 * in each script is a copy that drifts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Minimal .env loader — these scripts run outside the Next.js and Prisma
 * CLIs, which are what normally read .env for us. Same approach as
 * scripts/db-check.ts; avoids adding a dotenv dependency.
 */
export function loadEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const cleaned = raw.trim();
    if (!cleaned || cleaned.startsWith("#")) continue;

    const eq = cleaned.indexOf("=");
    if (eq === -1) continue;

    const key = cleaned.slice(0, eq).trim();
    const value = cleaned.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * Import lib/s3.ts from a plain node process.
 *
 * It starts with `import "server-only"`, a package whose whole job is to
 * throw the moment it is loaded outside a React Server Component. Next
 * swaps it for an empty module through the "react-server" export condition;
 * plain node has no such condition, so the real one runs and the import
 * dies before a single check has executed.
 *
 * Pre-seeding the require cache with an empty module satisfies the guard
 * without executing it. The alternative — reimplementing the config reader
 * and the signing in each script — would leave them testing a copy of the
 * code rather than the code the site actually runs, which is exactly the
 * bug class they exist to catch.
 */
export function loadS3Lib(): Promise<typeof import("../lib/s3")> {
  const require_ = createRequire(path.join(process.cwd(), "package.json"));
  const serverOnlyId = require_.resolve("server-only");

  require_.cache[serverOnlyId] = {
    id: serverOnlyId,
    filename: serverOnlyId,
    loaded: true,
    exports: {},
  } as NodeModule;

  return import("../lib/s3");
}

export const OK = "\x1b[32m✓\x1b[0m";
export const FAIL = "\x1b[31m✗\x1b[0m";
export const DIM = "\x1b[2m";
export const RESET = "\x1b[0m";
