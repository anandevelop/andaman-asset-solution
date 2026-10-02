/**
 * lib/admin/complete-order.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Is `ordered` a reordering of exactly `known` — every id once, nothing
 * else? A drag list saves the whole order at once; a list from a stale
 * screen (a row added or removed since it loaded) must be refused rather
 * than half-applied. Pure, so the rule is tested without a database.
 * ─────────────────────────────────────────────────────────────────────────
 */

export function isCompleteOrder(ordered: readonly string[], known: readonly string[]): boolean {
  if (ordered.length !== known.length) return false;
  const seen = new Set(ordered);
  if (seen.size !== ordered.length) return false;
  return known.every((id) => seen.has(id));
}
