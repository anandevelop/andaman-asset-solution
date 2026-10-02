"use client";

/**
 * components/admin/ui/FilterChip.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A toolbar filter as the mockup draws it: a dashed chip naming the
 * filter while it filters nothing; once set, solid sand with the chosen
 * value and an ✕ that clears it. Clicking opens the option list in a
 * popover (PopoverMenu — Escape, arrow keys and click-away included).
 *
 * Replaces the <select>s in LeadFilters, ProjectFilters and NewsFilters.
 * Only the presentation: each still writes the same URL parameter it did.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Filter, X, type LucideIcon } from "lucide-react";
import PopoverMenu from "@/components/admin/PopoverMenu";

export default function FilterChip({
  label,
  icon: Icon = Filter,
  options,
  value,
  onSelect,
  onClear,
  clearLabel,
}: {
  label: string;
  icon?: LucideIcon;
  options: { value: string; label: string }[];
  /** The selected option's value, or null when the filter is off. */
  value: string | null;
  onSelect: (value: string) => void;
  onClear: () => void;
  /** Accessible name of the ✕. */
  clearLabel: string;
}) {
  const current = value === null ? null : options.find((option) => option.value === value);
  const active = Boolean(current);

  return (
    <span
      className={[
        "inline-flex h-[30px] items-center rounded-[9px] text-[12.5px] transition-colors",
        active
          ? "border border-solid border-adm-fill/50 bg-adm-fill/14 text-adm-text"
          : "border border-dashed border-adm-line-strong text-adm-muted hover:border-adm-fill/60 hover:text-adm-text",
      ].join(" ")}
    >
      <PopoverMenu
        label={label}
        buttonClassName="inline-flex h-[28px] items-center gap-1.5 px-[11px]"
        buttonContent={
          <>
            <Icon size={14} aria-hidden />
            {current ? current.label : label}
          </>
        }
        options={options}
        selected={value}
        onSelect={onSelect}
      />
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${clearLabel}: ${label}`}
          className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-md text-adm-muted hover:bg-adm-text/8 hover:text-adm-text"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </span>
  );
}
