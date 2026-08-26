/**
 * lib/db.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Connection-failure handling for Prisma reads.
 *
 * Why this exists: a public marketing site should not return a 500 because
 * Postgres blinked. Read paths degrade to an empty state; the visitor sees a
 * page, and the operator sees a loud, actionable log line.
 *
 * Scope is deliberately narrow — ONLY connection-class errors are swallowed.
 * Query bugs, constraint violations and unique-key clashes still throw, so
 * they surface in development instead of silently returning nothing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { Prisma } from "@prisma/client";

/**
 * Prisma "P1xxx" = connection/engine layer.
 *   P1000 auth failed · P1001 can't reach server · P1002 timeout
 *   P1003 database does not exist · P1008 operation timeout
 *   P1010 access denied · P1017 server closed the connection
 * P2021/P2022 = table/column missing, i.e. migrations were never run —
 * treated the same way so a fresh clone renders instead of exploding.
 */
const OFFLINE_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1010",
  "P1017",
  "P2021",
  "P2022",
]);

export function isDatabaseOfflineError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    OFFLINE_CODES.has(error.code)
  ) {
    return true;
  }
  // Thrown before a request code is assigned (engine failed to start,
  // bad DATABASE_URL, no binary for the platform).
  return error instanceof Prisma.PrismaClientInitializationError;
}

/**
 * True when the failure is "Prisma Client predates this model".
 *
 * After adding a model to schema.prisma but before running
 * `prisma generate`, `prisma.newModel` is plain `undefined`. Calling
 * `.findMany()` on it throws a TypeError *before* any query is attempted,
 * so it is not a PrismaClientKnownRequestError and isDatabaseOfflineError()
 * correctly returns false — which meant safeQuery rethrew it and a page
 * that should have degraded to an empty state returned a 500 instead.
 *
 * This is always the same fix (regenerate the client), it only ever happens
 * in development or a half-finished deploy, and it should never take a page
 * down. Matched narrowly on the method name so a genuine TypeError in
 * application code still surfaces.
 */
const PRISMA_METHODS =
  "findMany|findUnique|findFirst|count|aggregate|groupBy|create|update|upsert|delete|updateMany|deleteMany|createMany";

/**
 * Both V8 phrasings:
 *   modern — Cannot read properties of undefined (reading 'findMany')
 *   legacy — Cannot read property 'findMany' of undefined
 * The project targets Node 20, which uses the first, but the guard costs
 * nothing and should not depend on a runtime's error wording.
 */
const STALE_CLIENT_METHOD = new RegExp(
  `Cannot read propert(?:y|ies) of undefined \\(reading '(?:${PRISMA_METHODS})'\\)` +
    `|Cannot read property '(?:${PRISMA_METHODS})' of undefined`,
);

export function isStaleClientError(error: unknown): boolean {
  return error instanceof TypeError && STALE_CLIENT_METHOD.test(error.message);
}

// ── Process-level status, read by pages after awaiting a query ──────────

let offlineSince: number | null = null;

/** True when the most recent read failed at the connection layer. */
export function isDatabaseOffline(): boolean {
  return offlineSince !== null;
}

function markOnline() {
  offlineSince = null;
}

// Throttle the log so a page with several queries doesn't print six times.
let lastWarnAt = 0;
const WARN_THROTTLE_MS = 10_000;

function markOffline(label: string, error: unknown) {
  const now = Date.now();
  if (offlineSince === null) offlineSince = now;

  if (now - lastWarnAt < WARN_THROTTLE_MS) return;
  lastWarnAt = now;

  const code =
    error instanceof Prisma.PrismaClientKnownRequestError ? ` [${error.code}]` : "";

  console.error(
    `\n──────────────────────────────────────────────────────────────\n` +
      `  DATABASE UNREACHABLE${code} — while running: ${label}\n` +
      `  Serving an empty state instead of crashing the page.\n\n` +
      `  Fix it with:\n` +
      `    npm run db:up          # start Postgres via Docker\n` +
      `    npm run prisma:migrate # create the tables\n` +
      `    npm run prisma:seed    # insert Trinity Village\n\n` +
      `  Diagnose with:  npm run db:check\n` +
      `──────────────────────────────────────────────────────────────\n`,
  );
}

/**
 * Run a Prisma read, returning `fallback` if the database is unreachable.
 * Any other error is rethrown untouched.
 */
export async function safeQuery<T>(
  label: string,
  query: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const result = await query();
    markOnline();
    return result;
  } catch (error) {
    if (isDatabaseOfflineError(error)) {
      markOffline(label, error);
      return fallback;
    }

    if (isStaleClientError(error)) {
      // Loud, specific, and non-fatal. The page renders its empty state and
      // the log says exactly which command fixes it.
      console.error(
        `\n──────────────────────────────────────────────────────────────\n` +
          `  PRISMA CLIENT OUT OF DATE — while running: ${label}\n` +
          `  A model used here does not exist on the generated client.\n\n` +
          `  Fix it with:\n` +
          `    npx prisma migrate dev     # local\n` +
          `    npx prisma generate        # if the tables already exist\n\n` +
          `  Then restart the dev server. Serving an empty state meanwhile.\n` +
          `──────────────────────────────────────────────────────────────\n`,
      );
      return fallback;
    }

    throw error;
  }
}

/** Thrown by pages that cannot render anything useful without the database. */
export class DatabaseUnavailableError extends Error {
  constructor(label: string) {
    super(`DATABASE_UNAVAILABLE: ${label}`);
    this.name = "DatabaseUnavailableError";
  }
}
