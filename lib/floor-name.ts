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
 * English is built the same way, so the ground is "Ground Floor" on every
 * type — admins had typed "1st Floor" on some and "Ground Floor" on others
 * for the same level. A label this cannot read keeps the typed name.
 *
 * The lift buttons follow the same count (localLiftLabel): on a Thai page
 * a "G" button beside a "ชั้น 1" heading read as two different floors. Free of server-only imports, like
 * lib/lift-label.ts beside it.
 * ─────────────────────────────────────────────────────────────────────────
 */

const CHINESE_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

function englishOrdinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

const NAMES: Record<
  string,
  { floor: (n: number) => string; roof: string; basement: string; mezzanine: string }
> = {
  // n counts the ground as 1, as the other languages do.
  en: {
    floor: (n) => (n === 1 ? "Ground Floor" : `${englishOrdinal(n - 1)} Floor`),
    roof: "Roof",
    basement: "Basement",
    mezzanine: "Mezzanine",
  },
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

/**
 * What the lift button prints. English keeps G/1/2. Thai, Chinese and
 * Russian count the ground as 1, so a British panel's G, 1, 2 becomes
 * 1, 2, 3 — matching "ชั้น 1, ชั้น 2…" beside it. R/B/M and labels this
 * cannot read are left alone.
 */
export function localLiftLabel(locale: string, shortLabel: string, panel: readonly string[]): string {
  if (locale === "en" || !NAMES[locale]) return shortLabel;
  const label = shortLabel.trim().toUpperCase();
  const british = panel.some((other) => other.trim().toUpperCase() === "G");
  if (!british) return shortLabel;
  if (label === "G") return "1";
  if (/^\d{1,2}$/.test(label)) return String(Number(label) + 1);
  return shortLabel;
}
