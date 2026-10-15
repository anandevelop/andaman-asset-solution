import "server-only";

/**
 * lib/site-plan-3d-check.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which plots a 3D scene file draws, compared with the project's units —
 * the admin card's "62 / 62" line (components/admin/SitePlan3dCard.tsx).
 *
 * The scenes are hand-modelled files with their plot list built in (a
 * `const SEED = [[1,"available",228,"A1"], …]` array; the plot label is the
 * fourth column, or for older files the number in the first, drawn "R01"). A plot in the system that the scene does
 * not draw would never light up in 3D, whatever its status; this is how
 * somebody finds out before a visitor does.
 *
 * Reads the file from public/ on the server. Returns null when the file is
 * missing or its plot list cannot be read — the card says so rather than
 * claiming a match it did not check.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export type SceneCheck = {
  /** Plot numbers the scene draws, e.g. "R01". */
  scenePlots: string[];
  /** In the system, not in the scene. */
  missing: string[];
  /** In the scene, not in the system. */
  extra: string[];
};

/**
 * Compare key for a plot number, the way the scenes match them: upper case,
 * a "+" dropped, leading zeros after the letter prefix dropped
 * ("R01" → "R1", "v07" → "V7", "A+13" → "A13").
 */
function key(unitNumber: string): string {
  return unitNumber.trim().toUpperCase().replace("+", "").replace(/^([A-Z]*)0*(?=\d)/, "$1");
}

/**
 * A SEED row's plot label. Newer scenes carry it in the fourth column
 * (`[1,"available",228,"A1","A"]`); older ones only have the number in the
 * first, drawn as "R01".
 */
function rowLabel(row: unknown): string | null {
  if (!Array.isArray(row)) return null;
  if (typeof row[3] === "string" && row[3].trim()) return row[3].trim();
  if (typeof row[0] === "number") return `R${String(row[0]).padStart(2, "0")}`;
  return null;
}

export async function checkScenePlots(src: string, unitNumbers: string[]): Promise<SceneCheck | null> {
  let html: string;
  try {
    html = await readFile(path.join(process.cwd(), "public", src), "utf8");
  } catch {
    return null;
  }

  const seed = /const\s+SEED\s*=\s*(\[[\s\S]*?\]\]);/.exec(html);
  if (!seed) return null;

  let rows: unknown;
  try {
    rows = JSON.parse(seed[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  const scenePlots = rows.map(rowLabel).filter((id): id is string => id !== null);

  const inScene = new Set(scenePlots.map(key));
  const systemByKey = new Map(unitNumbers.map((n) => [key(n), n.trim()]));

  return {
    scenePlots,
    missing: [...systemByKey]
      .filter(([k]) => !inScene.has(k))
      .map(([, label]) => label)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    extra: scenePlots.filter((id) => !systemByKey.has(key(id))),
  };
}
