/**
 * components/admin/TranslationStatusBadges.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Read-only per-locale completeness dots for one record, shown in a list
 * page's card header (Awards, Facilities, Sales Team, Nearby Attractions —
 * anywhere several records are edited inline on one page, so the
 * interactive LanguageTabs' completeness-per-tab doesn't apply: that
 * component picks the language being edited for the *whole page*, while
 * this shows, for *this one record*, which locales are actually done.
 *
 * Server Component — no interactivity, just four small labelled dots.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { locales, type Locale } from "@/i18n";
import type { CompletenessMap } from "@/lib/admin/translated-form";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  th: "TH",
  zh: "ZH",
  ru: "RU",
};

export default function TranslationStatusBadges({
  completeness,
}: {
  completeness: CompletenessMap;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {locales.map((lang) => (
        <span
          key={lang}
          title={LOCALE_LABELS[lang]}
          className={[
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
            completeness[lang]
              ? "bg-emerald-50 text-emerald-700"
              : "bg-surface-muted text-ink-muted",
          ].join(" ")}
        >
          {LOCALE_LABELS[lang]}
        </span>
      ))}
    </span>
  );
}
