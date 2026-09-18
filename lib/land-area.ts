/**
 * lib/land-area.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Land area in the units Thai property is actually measured in.
 *
 * Plot sizes are stored in square metres (ProjectUnit.landAreaSqm), which
 * is the right thing to store — one number, no ambiguity, and what every
 * other locale wants to read. But nobody in a Phuket sales office says "a
 * 496 square metre plot": they say "1 งาน 24 ตารางวา", and the Sale Kits,
 * title deeds and price lists are all written that way. Showing the raw
 * square metres to a Thai admin means they do the arithmetic in their head
 * every time they check a plot against a deed.
 *
 * The conversion is exact, not approximate — these are defined ratios:
 *   1 ตารางวา (square wah) = 4 m²
 *   1 งาน (ngan)           = 100 ตร.ว. = 400 m²
 *   1 ไร่ (rai)            = 4 งาน     = 1,600 m²
 *
 * Only the Thai locale gets this treatment. A Russian or Chinese buyer
 * reading the same admin has no use for rai, and "1 ngan 24 wah" would be
 * two unfamiliar words instead of one familiar number.
 * ─────────────────────────────────────────────────────────────────────────
 */

const SQM_PER_WA = 4;
const WA_PER_NGAN = 100;
const NGAN_PER_RAI = 4;
const WA_PER_RAI = WA_PER_NGAN * NGAN_PER_RAI;

export type LandAreaLabels = {
  rai: string;
  ngan: string;
  wa: string;
  sqm: string;
};

/** Trailing zeros dropped: 24 rather than 24.0, 24.5 kept as 24.5. */
function trim(value: number): string {
  return Number(value.toFixed(1)).toString();
}

/**
 * "1 งาน 24 ตร.ว." for Thai, "496 sq.m." everywhere else.
 *
 * Zero components are omitted rather than printed as "0 ไร่": a plot is
 * described by the units it actually has, the way a deed writes it. A plot
 * smaller than one wah — which no real plot is, but a mistyped 2 in the
 * admin would be — falls back to square metres rather than printing an
 * empty string.
 */
export function formatLandArea(
  locale: string,
  sqm: number,
  labels: LandAreaLabels,
): string {
  const sqmLabel = `${trim(sqm)} ${labels.sqm}`;

  if (locale !== "th") return sqmLabel;

  const totalWa = sqm / SQM_PER_WA;
  if (totalWa < 1) return sqmLabel;

  const rai = Math.floor(totalWa / WA_PER_RAI);
  const ngan = Math.floor((totalWa % WA_PER_RAI) / WA_PER_NGAN);
  const wa = totalWa % WA_PER_NGAN;

  const parts: string[] = [];
  if (rai > 0) parts.push(`${rai} ${labels.rai}`);
  if (ngan > 0) parts.push(`${ngan} ${labels.ngan}`);
  // The wah remainder is shown whenever it is non-zero, including when it
  // is the only component ("48 ตร.ว." for a small plot).
  if (wa >= 0.05) parts.push(`${trim(wa)} ${labels.wa}`);

  return parts.join(" ") || sqmLabel;
}
