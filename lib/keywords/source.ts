/**
 * lib/keywords/source.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where a batch of rank observations comes from, kept behind one interface
 * so the only thing that changes when this codebase eventually integrates
 * the real Google Search Console API is which function builds a
 * KeywordRankSource — not lib/keywords/rank-updates.ts, not the import
 * action, not the UI.
 *
 * `fetchRankUpdates()` takes no arguments on purpose. A CSV import already
 * has its whole answer in hand (a file someone just uploaded) the moment
 * this is called; a future API-backed source would instead spend that call
 * making the request, using a date range and credentials it already closed
 * over at construction time. Same method, same return shape, either way —
 * the caller never needs to know which kind of source it's holding.
 *
 * No `"server-only"` here: this file only parses text, no Prisma import —
 * the boundary that actually needs server-only is
 * lib/keywords/rank-updates.ts, which writes the results to the database.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { parseCsv } from "@/lib/csv";

export type RankObservation = {
  query: string;
  position: number;
  impressions: number | null;
  clicks: number | null;
};

export type RankSourceResult = {
  observations: RankObservation[];
  /** A row this source could not read — never silently dropped, per this
   *  codebase's CSV-import convention (see importUnitsCsv). `query` is
   *  filled in whenever the row got far enough to read it. */
  errors: { line?: number; query?: string; reason: string }[];
};

export interface KeywordRankSource {
  readonly name: string;
  fetchRankUpdates(): Promise<RankSourceResult>;
}

const REQUIRED_COLUMNS = ["query", "position"] as const;

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * `query,impressions,clicks,position` — a Google Search Console
 * Performance report export, columns in any order. `query` and `position`
 * are required per row; `impressions`/`clicks` are carried through for the
 * import summary but not persisted anywhere (Keyword has no such columns
 * yet — see lib/keywords/rank-updates.ts's header).
 */
function parseCsvRankUpdates(csvText: string): RankSourceResult {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { observations: [], errors: [{ reason: "EMPTY_FILE" }] };

  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  const columnIndex = (column: string) => header.indexOf(column);

  const missing = REQUIRED_COLUMNS.filter((column) => columnIndex(column) === -1);
  if (missing.length > 0) {
    return { observations: [], errors: [{ reason: `MISSING_COLUMNS:${missing.join(",")}` }] };
  }

  const observations: RankObservation[] = [];
  const errors: RankSourceResult["errors"] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const line = rowIndex + 1; // header = line 1, matching importUnitsCsv's convention
    if (row.every((cell) => cell.trim() === "")) continue; // a trailing blank line is not an error

    const cell = (column: string) => {
      const at = columnIndex(column);
      return at === -1 ? "" : (row[at] ?? "").trim();
    };

    const query = cell("query");
    if (!query) {
      errors.push({ line, reason: "MISSING_QUERY" });
      continue;
    }

    const positionText = cell("position");
    const position = parseOptionalInt(positionText);
    if (position === null || position < 1) {
      errors.push({ line, query, reason: "BAD_POSITION" });
      continue;
    }

    observations.push({
      query,
      position,
      impressions: parseOptionalInt(cell("impressions")),
      clicks: parseOptionalInt(cell("clicks")),
    });
  }

  return { observations, errors };
}

export function csvRankSource(csvText: string): KeywordRankSource {
  return {
    name: "csv",
    async fetchRankUpdates() {
      return parseCsvRankUpdates(csvText);
    },
  };
}

// Sketched, not built this phase — same interface, different constructor
// inputs (a date range + credentials instead of a string already in hand).
// The day this is implemented, lib/keywords/rank-updates.ts and every
// caller of csvRankSource() stay exactly as they are.
//
// export function searchConsoleRankSource(
//   locale: string,
//   range: { from: Date; to: Date },
// ): KeywordRankSource {
//   return {
//     name: "search-console",
//     async fetchRankUpdates() {
//       /* call the Search Console API, map its rows to RankObservation */
//     },
//   };
// }
