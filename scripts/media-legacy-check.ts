/**
 * scripts/media-legacy-check.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Finds database rows that still point at a decommissioned media host.
 *
 * Media moved from Supabase Storage to DigitalOcean Spaces, and lib/s3.ts
 * stores an *absolute* URL per upload rather than a bare object key. So the
 * move did not rewrite anything: every image uploaded before it still
 * carries its old `supabase.co` URL in whatever column it was written to.
 * Once the old bucket is gone those rows are broken images, and nothing in
 * the application says so — a gallery just renders one fewer picture.
 *
 * Rather than hardcode a list of image columns (there are two dozen across
 * thirty-odd models, and the list goes stale the moment someone adds a
 * field), this walks information_schema and checks every text and text[]
 * column in the schema. A new column is covered the day it is added.
 *
 * Report-only, deliberately. What to do with a hit is a content decision,
 * not a script's: a NewsArticle with a dead cover image wants a new one, a
 * FloorPlan whose `imageUrl` is NOT NULL cannot simply be blanked, and a
 * ProjectProgress month with three dead gallery entries may be worth
 * deleting outright. The script tells you which rows and which columns; a
 * human decides.
 *
 * Run with:  npm run media:legacy
 *            npm run media:legacy -- --host cdn.old-example.com
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from "@prisma/client";
import { loadEnv, OK, FAIL, DIM, RESET } from "./spaces-runtime";

loadEnv();

const WARN = "\x1b[33m!\x1b[0m";
const BOLD = "\x1b[1m";

/** The host that went away. Overridable for the next migration. */
const hostArg = process.argv.indexOf("--host");
const LEGACY_HOST = hostArg !== -1 ? process.argv[hostArg + 1] : "supabase.co";

if (!LEGACY_HOST) {
  console.error(`${FAIL} --host needs a value, e.g. --host cdn.old-example.com`);
  process.exit(1);
}

type TextColumn = { table_name: string; column_name: string; data_type: string };
type Hit = { table: string; column: string; count: number; sampleIds: string[] };

const prisma = new PrismaClient();

/**
 * Every column that could hold a URL. `ARRAY` covers `String[]` fields like
 * Project.gallery and ProjectProgress.images; casting one to text yields
 * its array literal, which contains the host if any element does.
 */
async function textColumns(): Promise<TextColumn[]> {
  return prisma.$queryRaw<TextColumn[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'ARRAY')
    ORDER BY table_name, column_name
  `;
}

/**
 * Quoted identifiers, because a column called "gallery" is fine but the
 * next one might not be — and this string is interpolated into SQL. The
 * names come from information_schema rather than from user input, but
 * quoting is what makes that safe rather than merely likely.
 */
function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Does this table have a plain `id` column we can name rows by? */
async function hasIdColumn(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'id'
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

async function scan(column: TextColumn, pattern: string): Promise<Hit | null> {
  const table = quote(column.table_name);
  const field = `${quote(column.column_name)}::text`;

  const [{ n }] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM ${table} WHERE ${field} LIKE $1`,
    pattern,
  );

  const count = Number(n);
  if (count === 0) return null;

  let sampleIds: string[] = [];

  if (await hasIdColumn(column.table_name)) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id"::text AS id FROM ${table} WHERE ${field} LIKE $1 ORDER BY "id" LIMIT 5`,
      pattern,
    );
    sampleIds = rows.map((row) => row.id);
  }

  return { table: column.table_name, column: column.column_name, count, sampleIds };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(`${FAIL} DATABASE_URL is not set. Add it to .env, or export it.`);
    process.exit(1);
  }

  // Host only, never the credentials — this output gets pasted into chats.
  const target = (() => {
    try {
      const { host, pathname } = new URL(process.env.DATABASE_URL!);
      return `${host}${pathname}`;
    } catch {
      return "(unparseable DATABASE_URL)";
    }
  })();

  console.log(`\n${BOLD}Legacy media scan${RESET}`);
  console.log(`${DIM}  database  ${target}${RESET}`);
  console.log(`${DIM}  looking for  ${LEGACY_HOST}${RESET}\n`);

  const columns = await textColumns();
  const pattern = `%${LEGACY_HOST}%`;
  const hits: Hit[] = [];

  for (const column of columns) {
    const hit = await scan(column, pattern);
    if (hit) hits.push(hit);
  }

  if (hits.length === 0) {
    console.log(
      `${OK} Nothing references ${LEGACY_HOST} ` +
        `${DIM}(${columns.length} text columns checked)${RESET}`,
    );
    console.log(
      `\n${DIM}  Safe to drop the host from images.remotePatterns in ` +
        `next.config.js.${RESET}\n`,
    );
    return;
  }

  const total = hits.reduce((sum, hit) => sum + hit.count, 0);
  console.log(`${WARN} ${total} row(s) still point at ${LEGACY_HOST}:\n`);

  for (const hit of hits) {
    const ids = hit.sampleIds.length
      ? `  ${DIM}e.g. ${hit.sampleIds.join(", ")}${hit.count > hit.sampleIds.length ? " …" : ""}${RESET}`
      : "";
    console.log(`   ${hit.table}.${hit.column}  ${BOLD}${hit.count}${RESET}${ids}`);
  }

  console.log(
    `\n${DIM}  These are already broken images if the old bucket is gone.\n` +
      `  Re-upload through /admin, or clear the field, before dropping the\n` +
      `  host from images.remotePatterns in next.config.js.${RESET}\n`,
  );

  // Non-zero so CI or a release step can gate on a clean result.
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`${FAIL} Scan failed:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
