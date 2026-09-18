/**
 * lib/prisma-adapter.ts
 * ─────────────────────────────────────────────────────────────────────────
 * How anything in this repo connects to Postgres, in one function.
 *
 * Prisma 7 removed the Rust query engine: a PrismaClient no longer reads
 * DATABASE_URL for itself, and `datasources: { db: { url } }` — the old way
 * to point one somewhere else — is gone with it. Every client now needs a
 * driver adapter handed to it, which turned "construct a PrismaClient" from
 * one line into three, in eight places.
 *
 * So it is written once. The seed script, the e2e setup, the CLI helpers
 * and the application client all build their adapter here, which means a
 * pool setting or an SSL option is added in one file rather than found in
 * seven and missed in the eighth.
 *
 * `url` is optional: omitted, it uses DATABASE_URL, which is what the
 * application and every script want. The e2e harness passes its own,
 * because pointing at the throwaway database rather than the real one is
 * the entire point of that code path.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PrismaPg } from "@prisma/adapter-pg";

export function pgAdapter(url: string | undefined = process.env.DATABASE_URL) {
  if (!url) {
    /* Worth failing loudly here rather than letting node-postgres default
       to a local socket and a username taken from the shell — which is how
       "connected fine, but every table is missing" happens. */
    throw new Error(
      "No Postgres connection string. Set DATABASE_URL, or pass one to pgAdapter().",
    );
  }

  return new PrismaPg({ connectionString: url });
}
