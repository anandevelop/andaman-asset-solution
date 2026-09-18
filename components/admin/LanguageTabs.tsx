"use client";

/**
 * components/admin/LanguageTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The "pick a language, then fill in that language's copy" dropdown used
 * above every admin form that edits a Translation table — see
 * lib/admin/translated-form.ts for the read-side half of this pattern.
 *
 * Implemented as a row of links carrying `?lang=xx`, not a client-side
 * <select> that swaps form state in place: every field below is an
 * uncontrolled input (`defaultValue`, matching every other admin form in
 * this codebase — see ProjectForm.tsx's file comment on why), so the only
 * reliable way to show a different locale's saved values is a real
 * navigation that gives the Server Component page a new `searchParams.lang`
 * to read and a freshly rendered set of `defaultValue`s. The edit page
 * pairs this with `key={lang}` on the form component to force React to
 * remount it rather than reuse the old DOM nodes — see any of the edit
 * pages using this component for that half.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { LOCALE_DISPLAY_ORDER, type Locale } from "@/i18n";

/** Native-script names — see the same map in components/Navbar.tsx for why
 *  these aren't translated. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  th: "TH",
  zh: "ZH",
  ru: "RU",
};

/** Same emerald/amber/red thresholds components/admin/NewsSeoPanel.tsx's
 *  ScoreDonut/scoreStroke already use for a 0-100 score — one ring
 *  convention across the admin, not a second one invented here. */
function ringStroke(percent: number): string {
  if (percent >= 80) return "#047857"; // emerald-700
  if (percent >= 40) return "#b45309"; // amber-700
  return "#b91c1c"; // red-700
}

/** A tab-sized copy of ScoreDonut's SVG math, scaled down to sit where the
 *  Check/AlertTriangle icon normally does. No text inside — at 16px there
 *  is no room to render "83" legibly, so the ring's fill alone carries the
 *  signal, and `title` on the tab link already carries the exact number
 *  for anyone who hovers. */
function CompletenessRing({ percent, dim }: { percent: number; dim: boolean }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" role="img" aria-label={`${percent}%`}>
      <circle cx="10" cy="10" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className={dim ? "text-white/30" : "text-primary/10"} />
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        stroke={dim ? "rgba(255,255,255,0.85)" : ringStroke(percent)}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}

type Props = {
  active: Locale;
  completeness: Record<Locale, boolean>;
  completeLabel: string;
  missingLabel: string;
  /** Optional per-locale completion percentage (0-100) — when present for
   *  a locale, a small ring replaces that tab's Check/AlertTriangle icon.
   *  Additive: every other caller of this component omits it and sees
   *  identical behavior to before. */
  percent?: Partial<Record<Locale, number>>;
};

export default function LanguageTabs({ active, completeness, completeLabel, missingLabel, percent }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (lang: Locale) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", lang);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div role="tablist" aria-label="Content language" className="flex flex-wrap items-center gap-2">
      {LOCALE_DISPLAY_ORDER.map((lang) => {
        const isActive = lang === active;
        const complete = completeness[lang];
        const ringPercent = percent?.[lang];

        return (
          <Link
            key={lang}
            href={hrefFor(lang)}
            role="tab"
            aria-selected={isActive}
            title={ringPercent !== undefined ? `${ringPercent}%` : complete ? completeLabel : missingLabel}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-white"
                : "border-primary/15 bg-white text-ink/70 hover:border-primary/30",
            ].join(" ")}
          >
            {LOCALE_LABELS[lang]}
            {ringPercent !== undefined ? (
              <CompletenessRing percent={ringPercent} dim={isActive} />
            ) : complete ? (
              <Check
                size={12}
                aria-hidden
                className={isActive ? "text-white" : "text-emerald-600"}
              />
            ) : (
              <AlertTriangle
                size={12}
                aria-hidden
                className={isActive ? "text-white/80" : "text-amber-500"}
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
