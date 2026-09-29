/**
 * lib/lift-label.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What a floor's lift button prints when the admin never set a label.
 *
 * FloorPlan.shortLabel is newer than the plans on the deployed site, so
 * those rows have none. Three places need a stand-in — the public page's
 * data layer, the admin draft and the admin preview — and they used to
 * repeat `floorName.charAt(0)` each. That was wrong twice:
 *
 *   - The draft did not apply it, but the save requires a label, so every
 *     save of such a type failed with "Give the floor a lift label" while
 *     the site and the preview showed a label that looked set.
 *   - The first character of "ชั้น 1" and "ชั้น 2" is "ช" for both, a lift
 *     panel with two identical buttons, which the save also refuses.
 *
 * So a number in the name wins, then a ground floor reads "G", and only
 * then the first character. Kept free of server-only imports so the client
 * preview can use it.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Matches FloorPlan.shortLabel's VarChar(3). */
const MAX = 3;

const GROUND = /\bground\b|ชั้นล่าง|ชั้นพื้นดิน|^g$/i;

export function liftLabelFor(shortLabel: string | null | undefined, floorName: string): string {
  const set = (shortLabel ?? "").trim();
  if (set) return set;

  const name = floorName.trim();
  const digits = name.match(/\d+/);
  if (digits) return digits[0].slice(0, MAX);
  if (GROUND.test(name)) return "G";

  return name.charAt(0).toUpperCase();
}
