/**
 * components/admin/agents/ui.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Small presentational pieces shared by the co-agent admin pages
 * (agent list, registration links): the on/off switch, the inline notice row
 * and the date formatters. Hook-free, so server and client components can
 * both render them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";

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
