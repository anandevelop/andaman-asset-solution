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
 *
 * The menu is portalled to <body> and positioned from the button's own
 * rectangle. Drawn in place it was clipped by whatever scrolled around it:
 * the leads table scrolls sideways inside its card, and the status menu
 * opened inside that box and was cut off after four rows. It opens upward
 * when there is not room below, and closes on scroll or resize rather
 * than drifting away from its button.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  interceptClick,
  className = "relative inline-block",
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
  /** Return true to handle a click on the button yourself instead of
   *  opening the menu — shift-click selecting a unit tile, say. */
  interceptClick?: (event: React.MouseEvent<HTMLButtonElement>) => boolean;
  /** The wrapper's classes; it must stay positioned for the menu. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onMove = (event: Event) => {
      // Scrolling the menu's own list is not a reason to close it.
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    // Land on the current choice, as a select does.
    const current = Math.max(
      0,
      options.findIndex((option) => option.value === selected),
    );
    itemRefs.current[current]?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, options, selected]);

  /** Where the menu goes: under the button, or over it when the viewport
   *  has less than the menu's max height (288px) left below. */
  const place = () => {
    const box = buttonRef.current?.getBoundingClientRect();
    if (!box) return;
    const below = window.innerHeight - box.bottom;
    const vertical: CSSProperties =
      below < 300 && box.top > below ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 };
    const horizontal: CSSProperties = align === "right" ? { right: window.innerWidth - box.right } : { left: box.left };
    setPosition({ ...vertical, ...horizontal });
  };

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
    <div ref={rootRef} className={className} onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={(event) => {
          if (interceptClick?.(event)) return;
          if (!open) place();
          setOpen((value) => !value);
        }}
        className={buttonClassName}
      >
        {buttonContent}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            onClick={(event) => event.stopPropagation()}
            style={position}
            className="fixed z-[70] max-h-72 min-w-44 overflow-y-auto rounded-[12px] border border-adm-line bg-adm-solid p-1 shadow-[var(--adm-shadow-float)]"
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
                  className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] text-adm-text transition-colors hover:bg-adm-text/5 focus:bg-adm-text/5 focus:outline-hidden"
                >
                  {option.dotClassName && (
                    <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${option.dotClassName}`} />
                  )}
                  <span className="flex-1 truncate">{option.label}</span>
                  {checked && <Check size={14} aria-hidden className="shrink-0 text-adm-info" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
