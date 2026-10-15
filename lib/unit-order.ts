/**
 * lib/unit-order.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Plot numbers in reading order: A1, A2 … A10, A+13 … B1.
 *
 * Unit lists are fetched `orderBy: [sortOrder, unitNumber]`. When a
 * project's plots all share a sortOrder (imported without one, as The
 * Victory's were), the database falls back to comparing unitNumber as
 * text — "A+13" before "A1" ('+' sorts before digits) and "A10" before
 * "A2". These helpers keep the database's order between sortOrder (and
 * phase) groups and only re-sort the plots inside each group by number.
 * ─────────────────────────────────────────────────────────────────────────
 */

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** "A+13" sorts as "A13", digits compare as numbers. */
export function compareUnitNumbers(a: string, b: string): number {
  return collator.compare(a.replace("+", ""), b.replace("+", "")) || collator.compare(a, b);
}

/**
 * Re-sorts by plot number within each run of consecutive units that share
 * `groupKey` (e.g. sortOrder, or phase + sortOrder), leaving the order of
 * the runs as the database returned them.
 */
export function sortUnitsWithinGroups<T extends { unitNumber: string }>(
  units: T[],
  groupKey: (unit: T) => unknown,
): T[] {
  const out: T[] = [];
  let run: T[] = [];
  let runKey: unknown = Symbol("none");
  const flush = () => {
    run.sort((a, b) => compareUnitNumbers(a.unitNumber, b.unitNumber));
    out.push(...run);
    run = [];
  };
  for (const unit of units) {
    const key = groupKey(unit);
    if (key !== runKey && run.length) flush();
    runKey = key;
    run.push(unit);
  }
  flush();
  return out;
}
