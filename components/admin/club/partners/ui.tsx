/**
 * components/admin/club/partners/ui.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Small presentational pieces shared by the partner table, the partner
 * form and the unit drawer's benefit section — the mockup's `.pct` box
 * ("ลด [ 20 ] %"), the on/off switch and the category icon. Hook-free, so
 * both server and client components can render them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { InputHTMLAttributes, ReactNode } from "react";
import { Flag, Hospital, Leaf, Store, Sun, UtensilsCrossed, type LucideIcon } from "lucide-react";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  hosp: Hospital,
  dine: UtensilsCrossed,
  beach: Sun,
  spa: Leaf,
  act: Flag,
};

export function CategoryIcon({ category, size = 15, className }: { category: string; size?: number; className?: string }) {
  const Icon = CATEGORY_ICON[category] ?? Store;
  return <Icon size={size} aria-hidden className={className} />;
}

/** The partner avatar: cover image if any, else the category icon on black. */
export function PartnerAvatar({ category, cover, size = 36 }: { category: string; cover?: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        ...(cover ? { backgroundImage: `url(${JSON.stringify(cover)})` } : {}),
      }}
      className="grid flex-none place-items-center rounded-[10px] bg-[#141416] bg-cover bg-center text-[#d9c4a1]"
    >
      {cover ? null : <CategoryIcon category={category} size={Math.round(size * 0.42)} />}
    </span>
  );
}

export type PctTone = "default" | "empty" | "override" | "bad";

const PCT_TONE: Record<PctTone, string> = {
  default: "border-adm-line-strong bg-adm-panel",
  empty: "border-adm-line-strong bg-adm-text/5",
  override: "border-adm-fill bg-adm-fill/10",
  bad: "border-adm-danger bg-adm-danger-bg",
};

/** "ลด [ n ] %" — the input itself is passed through untouched. */
export function PctField({
  prefix,
  tone = "default",
  size = "md",
  title,
  inputProps,
}: {
  prefix: string;
  tone?: PctTone;
  size?: "sm" | "md" | "lg";
  title?: string;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
}) {
  const height = size === "sm" ? "h-7" : size === "lg" ? "h-10 w-full" : "h-[34px]";
  const width = size === "sm" ? "w-10" : size === "lg" ? "min-w-0 flex-1 text-[15px]" : "w-11";
  return (
    <label
      title={title}
      className={`inline-flex items-center overflow-hidden rounded-[9px] border text-[12.5px] transition-shadow focus-within:border-adm-fill focus-within:ring-3 focus-within:ring-adm-fill/20 has-[input:disabled]:opacity-50 ${height} ${PCT_TONE[tone]}`}
    >
      <span className="pl-2.5 pr-2 text-xs text-adm-muted">{prefix}</span>
      <input
        type="number"
        min={1}
        max={100}
        step={1}
        inputMode="numeric"
        {...inputProps}
        className={`h-full border-0 bg-transparent px-0.5 text-right font-semibold text-adm-text outline-none [appearance:textfield] placeholder:font-normal placeholder:text-adm-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${width}`}
      />
      <em className="grid h-full place-items-center border-l border-adm-line bg-adm-text/5 px-2.5 font-semibold not-italic text-adm-muted">
        %
      </em>
    </label>
  );
}

/** The mockup's `.sw` switch. A button so it can sit outside a form. */
export function Switch({
  checked,
  label,
  title,
  disabled,
  onClick,
  small,
}: {
  checked: boolean;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        small ? "h-[18px] w-8" : "h-5 w-9",
        checked ? "bg-adm-success" : "bg-adm-text/20",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "absolute rounded-full bg-white shadow transition-[left]",
          small ? "top-[2px] h-[14px] w-[14px]" : "top-[2px] h-4 w-4",
          checked ? (small ? "left-[16px]" : "left-[18px]") : "left-[2px]",
        ].join(" ")}
      />
    </button>
  );
}

/** Inline notice row (the mockup's `.note`). */
export function Note({ tone = "info", icon, children }: { tone?: "info" | "warning" | "danger"; icon?: ReactNode; children: ReactNode }) {
  const cls =
    tone === "warning"
      ? "bg-adm-warning-bg text-adm-warning"
      : tone === "danger"
        ? "bg-adm-danger-bg text-adm-danger"
        : "bg-adm-status-info-bg text-adm-status-info";
  return (
    <div className={`flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-relaxed ${cls}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const DATE_LOCALE: Record<string, string> = { th: "th-TH", en: "en-GB", zh: "zh-CN", ru: "ru-RU" };

/** "20 ต.ค. 69" / "20 Oct 26". Date-only values are stored at UTC midnight. */
export function fmtDate(value: Date | string | null | undefined, locale: string, timeZone = "UTC"): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone,
  }).format(date);
}

export function fmtDateTime(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
}
