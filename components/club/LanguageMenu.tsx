"use client";
/**
 * components/club/LanguageMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The portal's language switch, as a flag dropdown (login) or a flag row
 * (account). It writes NEXT_LOCALE — the cookie the member-host proxy
 * reads to pick the locale it rewrites to — and then either reloads (on
 * member.*, where the URL carries no locale) or swaps the /<locale>/ prefix
 * (localhost).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { CLUB_LOCALES, type ClubLocale } from "./format";

const NATIVE: Record<ClubLocale, string> = { th: "ไทย", en: "English", zh: "中文", ru: "Русский" };
const FLAG: Record<ClubLocale, string> = { th: "/flags/th.svg", en: "/flags/gb.svg", zh: "/flags/cn.svg", ru: "/flags/ru.svg" };

function Flag({ locale }: { locale: ClubLocale }) {
  return (
    <span
      className="inline-block h-3 w-[18px] shrink-0 rounded-[2px] bg-cover bg-center shadow-[0_0_0_0.5px_rgb(0_0_0/0.25)]"
      style={{ backgroundImage: `url(${FLAG[locale]})` }}
      aria-hidden
    />
  );
}

function useSwitchLocale(current: string, base: string) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [pending, start] = useTransition();
  const change = (next: ClubLocale) => {
    if (next === current) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    start(() => {
      if (base && pathname.startsWith(`/${current}/`)) {
        router.replace(`/${next}${pathname.slice(current.length + 1)}${window.location.search}`);
      } else {
        // member.*: same URL, new rewrite target — a full load picks up the locale everywhere.
        window.location.reload();
      }
    });
  };
  return { change, pending };
}

type Props = { locale: string; base: string; label: string; variant?: "dropdown" | "row" };

export default function LanguageMenu({ locale, base, label, variant = "dropdown" }: Props) {
  const current = (CLUB_LOCALES as readonly string[]).includes(locale) ? (locale as ClubLocale) : "th";
  const { change, pending } = useSwitchLocale(current, base);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (variant === "row") {
    return (
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5" aria-busy={pending}>
        {CLUB_LOCALES.map((lc) => (
          <button
            key={lc}
            type="button"
            role="radio"
            aria-checked={lc === current}
            onClick={() => change(lc)}
            className={`flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-club-accent ${
              lc === current ? "border-club-accent bg-club-surface-2 text-club-text" : "border-club-line text-club-text-2"
            }`}
          >
            <Flag locale={lc} />
            <span lang={lc}>{NATIVE[lc]}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${NATIVE[current]}`}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-full border border-club-line px-3 text-[12px] text-club-text-2 outline-none focus-visible:ring-2 focus-visible:ring-club-accent"
      >
        <Flag locale={current} />
        <span>{NATIVE[current]}</span>
        <ChevronDown size={12} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-44 overflow-hidden rounded-2xl border border-club-line bg-club-surface p-1 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)]"
        >
          {CLUB_LOCALES.map((lc) => (
            <li key={lc} role="option" aria-selected={lc === current}>
              <button
                type="button"
                lang={lc}
                onClick={() => {
                  setOpen(false);
                  change(lc);
                }}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] text-club-text outline-none hover:bg-club-surface-2 focus-visible:bg-club-surface-2"
              >
                <Flag locale={lc} />
                <span className="flex-1">{NATIVE[lc]}</span>
                {lc === current ? <Check size={14} className="text-club-accent" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
