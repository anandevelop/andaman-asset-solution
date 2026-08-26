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
import { locales, type Locale } from "@/i18n";

/** Native-script names — see the same map in components/Navbar.tsx for why
 *  these aren't translated. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  th: "TH",
  zh: "ZH",
  ru: "RU",
};

type Props = {
  active: Locale;
  completeness: Record<Locale, boolean>;
  completeLabel: string;
  missingLabel: string;
};

export default function LanguageTabs({ active, completeness, completeLabel, missingLabel }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (lang: Locale) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", lang);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div role="tablist" aria-label="Content language" className="flex flex-wrap items-center gap-2">
      {locales.map((lang) => {
        const isActive = lang === active;
        const complete = completeness[lang];

        return (
          <Link
            key={lang}
            href={hrefFor(lang)}
            role="tab"
            aria-selected={isActive}
            title={complete ? completeLabel : missingLabel}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-white"
                : "border-primary/15 bg-white text-ink/70 hover:border-primary/30",
            ].join(" ")}
          >
            {LOCALE_LABELS[lang]}
            {complete ? (
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
