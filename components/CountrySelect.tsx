"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { countriesSortedFor, countryByIso2, flagSrc, type Country } from "@/lib/countries";
import type { Locale } from "@/i18n";

/**
 * components/CountrySelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One combobox, two jobs: LeadForm.tsx's phone-country-code picker
 * (`variant="dial"`) and its nationality picker (`variant="nationality"`).
 * Both need the same thing — find a country by name, dial code or ISO2,
 * searchable in any of the four site languages, with a real flag next to
 * it — so this is one component rather than two near-duplicates.
 *
 * role="combobox" LIVES ON THE BUTTON, NOT THE SEARCH INPUT
 *
 * That is not the textbook ARIA 1.2 combobox pattern (there, the role sits
 * on the text input itself). It is what LeadForm.tsx's spec explicitly
 * calls for, because the visible control here is a closed, flag-plus-text
 * button most of the time — the search input only exists once the panel is
 * open, mounted fresh each time. Keyboard and screen-reader users still get
 * a fully operable widget (aria-expanded/aria-controls on the button,
 * role="listbox" + aria-activedescendant on the search input while open);
 * it just does not chase textbook conformance over the shape this form
 * actually needs.
 *
 * SEARCH MATCHES ALL FOUR LOCALES AT ONCE, NOT JUST THE ACTIVE ONE
 *
 * A Thai visitor filling in the English contact page still thinks in
 * Thai country names. Matching name/demonym across every locale (plus
 * dial code and ISO2) means "ไทย" finds Thailand on /en/contact just as
 * well as on /th/contact, at the cost of a handful of extra string
 * comparisons over 243 rows — not worth gating behind the active locale.
 */

const LOCALES: readonly Locale[] = ["en", "th", "zh", "ru"];

const PANEL_MAX_HEIGHT = 248;

type Props = {
  id: string;
  /** "dial": trigger shows flag + dial code, rows show dial code too.
   *  "nationality": trigger shows flag + country name, value is optional. */
  variant: "dial" | "nationality";
  /** ISO2, upper-case. `null` only ever occurs for variant="nationality". */
  value: string | null;
  onChange: (iso2: string | null) => void;
  locale: Locale;
  /** Shown, dimmed, on the trigger when `value` is null. */
  placeholder: string;
  searchPlaceholder: string;
  /** Row label + selectable option for clearing a nationality. Ignored
   *  for variant="dial", which always has a value. */
  noneLabel: string;
  noResultsLabel: string;
  disabled?: boolean;
  /**
   * Required whenever the trigger has no associated <label for="...">
   * (the phone-country selector: the phone field's own visible label
   * targets the number input beside it, not this button).
   *
   * role="combobox" is not a "name from content" role in the accessible
   * name computation spec, unlike role="button" — a sighted user reads
   * "+66" right off the trigger, but without this a screen reader
   * announces nothing at all for it, not even that text. The nationality
   * field does not need this: `id` there matches a real
   * <label htmlFor="nationality">, which the name computation does pick up.
   */
  "aria-label"?: string;
  "aria-required"?: true;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

function matches(country: Country, needle: string): boolean {
  if (needle === "") return true;
  const lower = needle.toLowerCase();

  if (country.iso2.toLowerCase().includes(lower)) return true;
  if (country.dial.replace("+", "").startsWith(needle.replace("+", ""))) return true;

  return LOCALES.some(
    (locale) =>
      country.name[locale].toLowerCase().includes(lower) ||
      country.demonym[locale].toLowerCase().includes(lower),
  );
}

export default function CountrySelect({
  id,
  variant,
  value,
  onChange,
  locale,
  placeholder,
  searchPlaceholder,
  noneLabel,
  noResultsLabel,
  disabled,
  ...a11y
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = countryByIso2(value);
  const sorted = useMemo(() => countriesSortedFor(locale), [locale]);
  const filtered = useMemo(
    () => sorted.filter((country) => matches(country, query.trim())),
    [sorted, query],
  );

  // The "not specified" row only exists for nationality, and only counts
  // as an option when nothing has been typed to filter it away.
  const showNone = variant === "nationality" && noneLabel.toLowerCase().includes(query.trim().toLowerCase());
  const optionCount = filtered.length + (showNone ? 1 : 0);

  function openPanel() {
    // Reset before mount, not in an effect that fires after — an effect
    // reacting to `open` would set state during the same commit React just
    // rendered, forcing a second, avoidable render.
    setQuery("");
    setHighlighted(0);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    // Deferred one tick: the search input has just mounted (it does not
    // exist while the panel is closed) and needs to exist before it can
    // take focus.
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  function selectIndex(index: number) {
    if (showNone && index === 0) {
      onChange(null);
    } else {
      const country = filtered[index - (showNone ? 1 : 0)];
      if (country) onChange(country.iso2);
    }
    setOpen(false);
    containerRef.current?.querySelector<HTMLButtonElement>("button[role=combobox]")?.focus();
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlighted((i) => Math.min(i + 1, optionCount - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlighted((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (optionCount > 0) selectIndex(highlighted);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>("button[role=combobox]")?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const listboxId = `${id}-listbox`;
  const activeOptionId =
    optionCount > 0 ? `${id}-option-${highlighted === 0 && showNone ? "none" : (filtered[highlighted - (showNone ? 1 : 0)]?.iso2 ?? "")}` : undefined;

  const TRIGGER =
    "flex w-full items-center gap-2 rounded-xs border border-primary/15 bg-white px-3 py-3 text-sm text-ink outline-hidden transition-colors hover:border-primary/30 focus:border-accent aria-invalid:border-red-500 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={`${TRIGGER} ${open ? "border-accent ring-1 ring-accent/30" : ""}`}
        {...a11y}
      >
        {selected ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny flag
                sprite, not a content image; next/image's overhead buys
                nothing here. */}
            <img src={flagSrc(selected.iso2)} alt="" aria-hidden className="h-4 w-5 shrink-0 rounded-[2px] object-cover" />
            <span className="truncate">{variant === "dial" ? selected.dial : selected.demonym[locale]}</span>
          </>
        ) : (
          <>
            {/* A globe, not a blank slot: an empty box with dimmed text
                alone reads as "nothing to see here" rather than "pick
                one" — the same reason a language switcher shows a globe
                rather than leaving its own trigger bare. */}
            <Globe size={16} className="shrink-0 text-ink/40" aria-hidden />
            <span className="truncate text-ink-muted">{placeholder}</span>
          </>
        )}
        <ChevronDown size={16} className="ml-auto shrink-0 text-ink/40" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-full min-w-[260px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xs border border-primary/15 bg-white shadow-lg">
          <div className="border-b border-primary/10 p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              autoComplete="off"
              className="w-full rounded-xs border border-primary/15 px-2 py-1.5 text-sm text-ink outline-hidden focus:border-accent"
            />
          </div>

          <ul id={listboxId} role="listbox" ref={listRef} className="overflow-y-auto py-1" style={{ maxHeight: PANEL_MAX_HEIGHT }}>
            {showNone && (
              <li
                id={`${id}-option-none`}
                role="option"
                aria-selected={value === null}
                data-index={0}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectIndex(0)}
                onMouseEnter={() => setHighlighted(0)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink/60 ${highlighted === 0 ? "bg-accent/10" : ""}`}
              >
                <Globe size={16} className="shrink-0 text-ink/40" aria-hidden />
                {noneLabel}
              </li>
            )}

            {filtered.map((country, i) => {
              const index = i + (showNone ? 1 : 0);
              return (
                <li
                  key={country.iso2}
                  id={`${id}-option-${country.iso2}`}
                  role="option"
                  aria-selected={country.iso2 === value}
                  data-index={index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectIndex(index)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink ${highlighted === index ? "bg-accent/10" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- same
                      reasoning as the trigger's flag above. */}
                  <img src={flagSrc(country.iso2)} alt="" aria-hidden className="h-4 w-5 shrink-0 rounded-[2px] object-cover" />
                  <span className="truncate">{variant === "dial" ? country.name[locale] : country.demonym[locale]}</span>
                  {variant === "dial" && <span className="ml-auto shrink-0 text-ink-muted">{country.dial}</span>}
                </li>
              );
            })}

            {optionCount === 0 && <li className="px-3 py-2 text-sm text-ink-muted">{noResultsLabel}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
