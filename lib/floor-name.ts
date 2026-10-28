/**
 * lib/floor-name.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A floor's name in the page's language, made from its lift label.
 *
 * FloorPlan.floorName is one string, typed in English — "Ground Floor",
 * "1st Floor" — and the unit-type ride printed it as-is on the Thai,
 * Chinese and Russian pages. The lift label beside it ("G", "1", "R") is
 * language-free, so the name can be built from that instead.
 *
 * The catch is what "1" means. With a "G" button on the same panel the
 * numbering is British: G is the ground, 1 the floor above it. Thai,
 * Chinese and Russian all count the ground floor as the first, so there
 * "1" is the second floor — ชั้น 2, 二层, 2-й этаж. Without a "G", the
 * panel already counts from the ground and "1" is the first floor
 * everywhere.
 *
 * English keeps the name the admin typed, and a label this cannot read
 * keeps it in every language. Free of server-only imports, like
 * lib/lift-label.ts beside it.
 * ─────────────────────────────────────────────────────────────────────────
 */

const CHINESE_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const NAMES: Record<
  string,
  { floor: (n: number) => string; roof: string; basement: string; mezzanine: string }
> = {
  th: { floor: (n) => `ชั้น ${n}`, roof: "ชั้นดาดฟ้า", basement: "ชั้นใต้ดิน", mezzanine: "ชั้นลอย" },
  zh: {
    floor: (n) => `${CHINESE_DIGITS[n] ?? n}层`,
    roof: "屋顶层",
    basement: "地下层",
    mezzanine: "夹层",
  },
  ru: { floor: (n) => `${n}-й этаж`, roof: "Крыша", basement: "Подвальный этаж", mezzanine: "Антресоль" },
};

/**
 * @param shortLabel This floor's lift label, already resolved by
 *   liftLabelFor.
 * @param panel Every lift label on the same unit type — whether a "G" is
 *   among them decides the numbering.
 */
export function localFloorName(
  locale: string,
  floorName: string,
  shortLabel: string,
  panel: readonly string[],
): string {
  const names = NAMES[locale];
  if (!names) return floorName;

  const label = shortLabel.trim().toUpperCase();
  const british = panel.some((other) => other.trim().toUpperCase() === "G");

  if (label === "G") return names.floor(1);
  if (label === "R") return names.roof;
  if (label === "B") return names.basement;
  if (label === "M") return names.mezzanine;
  if (/^\d{1,2}$/.test(label)) {
    const n = Number(label) + (british ? 1 : 0);
    return n > 0 ? names.floor(n) : floorName;
  }
  return floorName;
}
