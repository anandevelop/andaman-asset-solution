/**
 * components/club/CategoryIcon.tsx — partner category → lucide icon, per
 * PARTNER_CATEGORIES in lib/club/constants.ts. Server-safe (no hooks).
 */
import { Flag, Hospital, Leaf, Store, Sun, UtensilsCrossed, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { hosp: Hospital, dine: UtensilsCrossed, beach: Sun, spa: Leaf, act: Flag };

export default function CategoryIcon({ category, size = 18, className = "" }: { category: string; size?: number; className?: string }) {
  const Icon = ICONS[category] ?? Store;
  return <Icon size={size} strokeWidth={1.5} className={className} aria-hidden />;
}

const KNOWN = new Set(Object.keys(ICONS));

/** "โรงพยาบาล" for a known category key, the raw key otherwise (never a missing-message error). */
export function categoryLabel(t: (key: string) => string, category: string): string {
  return KNOWN.has(category) ? t(`categories.${category}`) : category;
}
