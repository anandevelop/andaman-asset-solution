"use client";

/**
 * components/admin/KeywordRankImportPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Imports a Search Console-shaped rank CSV (query, impressions, clicks,
 * position) — same file.text() → server-action-with-string shape as
 * UnitsPanel/UrlRedirectManager's importers, the one addition being a
 * locale picker that must be chosen before the file input unlocks:
 * a GSC export carries no locale column, and per this phase's binding
 * decision, an unmatched query creates a new tracked Keyword in whichever
 * locale the admin says this particular report is for.
 *
 * Calls useTranslations() itself rather than receiving translated text as
 * props — a Server Component parent cannot pass functions like a plural
 * formatter across the client boundary (only Server Actions get that
 * exception), so this needs its own `t`, the same as every other
 * "use client" component in this codebase that renders translated copy
 * computed at interaction time rather than at page-load time.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Upload, Loader2 } from "lucide-react";
import { locales, type Locale } from "@/i18n";
import type { importKeywordRanksCsv, KeywordCsvImportResult } from "@/app/[locale]/admin/(growth)/seo/keywords/actions";

const LOCALE_LABELS: Record<Locale, string> = { en: "EN", th: "TH", zh: "ZH", ru: "RU" };

type Props = {
  uiLocale: string;
  action: typeof importKeywordRanksCsv;
};

export default function KeywordRankImportPanel({ uiLocale, action }: Props) {
  const t = useTranslations("admin.seo.keywords.import");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [keywordLocale, setKeywordLocale] = useState<Locale | "">("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<KeywordCsvImportResult | null>(null);

  const reason = (code: string) => {
    const key = `reasons.${code}`;
    return t.has(key as never) ? t(key as never) : code;
  };

  const runImport = async (file: File) => {
    if (!keywordLocale) return;
    setResult(null);
    const text = await file.text();

    startTransition(async () => {
      const outcome = await action(uiLocale, keywordLocale, text);
      setResult(outcome);
      if (outcome.ok && (outcome.created > 0 || outcome.updated > 0)) router.refresh();
    });
  };

  return (
    <section className="admin-card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-primary">{t("title")}</h2>
        <p className="mt-1 text-xs text-ink-muted">{t("intro")}</p>
        <p className="mt-1 font-mono text-xs text-ink-muted">{t("columns")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ink">
          {t("localeLabel")}
          <select
            value={keywordLocale}
            onChange={(event) => setKeywordLocale(event.target.value as Locale)}
            className="admin-input h-8 w-auto! py-0! text-xs"
          >
            <option value="">{t("localePlaceholder")}</option>
            {locales.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void runImport(file);
            event.target.value = "";
          }}
          className="hidden"
        />
        <button
          type="button"
          disabled={!keywordLocale || pending}
          onClick={() => fileRef.current?.click()}
          className="admin-btn py-2! text-xs"
        >
          {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Upload size={13} aria-hidden />}
          {t("choose")}
        </button>
      </div>

      {result && !result.ok && (
        <p className="flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {reason(result.error)}
        </p>
      )}

      {result?.ok && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check size={13} aria-hidden />
            {t("created", { count: result.created })} · {t("updated", { count: result.updated })}
          </p>
          {result.errors.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-amber-800">{t("errorsTitle")}</p>
              <ul className="space-y-0.5 text-xs text-ink-muted">
                {result.errors.slice(0, 20).map((row, index) => (
                  <li key={index}>
                    {row.line !== undefined && <span className="font-mono">#{row.line}</span>} {row.query} —{" "}
                    {reason(row.reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
