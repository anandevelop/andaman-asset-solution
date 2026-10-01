"use client";

/**
 * components/admin/PopoverMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A button that opens a short list of choices — the status pill's menu,
 * "+ assign", and the bulk bar's two menus.
 *
 * A native <select> did this job until v4, and did it accessibly for free;
 * what it cannot do is look like a status pill or sit in a toolbar as a
 * chip. So this keeps what the select gave: Escape closes and returns
 * focus to the button, arrow keys move through the options, a click
 * anywhere else closes, and the options are menuitemradio with the current
 * one checked.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

export type PopoverOption = { value: string; label: string; dotClassName?: string };

export default function PopoverMenu({
  label,
  buttonContent,
  buttonClassName,
  options,
  selected,
  onSelect,
  align = "left",
  disabled = false,
}: {
  /** Accessible name of the button — its visible content may be a pill. */
  label: string;
  buttonContent: ReactNode;
  buttonClassName: string;
  options: PopoverOption[];
  selected?: string | null;
  onSelect: (value: string) => void;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    // Land on the current choice, as a select does.
    const current = Math.max(0, options.findIndex((option) => option.value === selected));
    itemRefs.current[current]?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, options, selected]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {buttonContent}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={[
            "absolute top-full z-40 mt-1.5 max-h-72 min-w-44 overflow-y-auto rounded-[12px] border border-adm-line bg-adm-solid p-1 shadow-[var(--adm-shadow-float)]",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {options.map((option, index) => {
            const checked = option.value === selected;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                onClick={() => {
                  close();
                  if (!checked) onSelect(option.value);
                }}
                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-primary/5 focus:bg-primary/5 focus:outline-hidden"
              >
                {option.dotClassName && (
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${option.dotClassName}`} />
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {checked && <Check size={14} aria-hidden className="shrink-0 text-adm-info" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
