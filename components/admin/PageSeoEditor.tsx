"use client";

/**
 * components/admin/PageSeoEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One project's search settings (Seo.dc.html) — the per-language copy on
 * the left, and what Google and a chat app will actually make of it on the
 * right.
 *
 * The previews render from the same values as the fields beside them, so
 * they move as you type; the search-result preview shows *both* the
 * language being edited and the site's other filled-in languages, because
 * the mistake this screen catches most often is a Thai title that reads
 * well and an English one nobody ever wrote.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, ImageIcon, Loader2, X } from "lucide-react";
import {
  saveLocaleSeo,
  saveProjectSeo,
} from "@/app/[locale]/admin/(catalog)/projects/[id]/seo/actions";
import { SEO_LIMITS } from "@/lib/seo-limits";
import ImageUploader from "@/components/admin/ImageUploader";

export type LocaleSeo = {
  locale: string;
  label: string;
  title: string;
  description: string;
  keywords: string[];
  noIndex: boolean;
  complete: boolean;
};

export type StructuredDataView = { type: string; detail: string; emitted: boolean };

type Props = {
  adminLocale: string;
  projectId: string;
  slug: string;
  siteOrigin: string;
  perLocale: LocaleSeo[];
  ogImageUrl: string;
  heroImageUrl: string | null;
  canonicalUrl: string;
  sitemapPriority: number | null;
  sitemapChangeFreq: string;
  structuredData: StructuredDataView[];
  labels: {
    sectionTitle: string;
    keywords: string;
    keywordsHint: string;
    addKeyword: string;
    title: string;
    description: string;
    tooLong: string;
    url: string;
    urlHint: string;
    canonical: string;
    canonicalHint: string;
    shareImage: string;
    shareImageFallback: string;
    sitemapPriority: string;
    sitemapChangeFreq: string;
    useDefault: string;
    noIndex: string;
    noIndexHint: string;
    save: string;
    saved: string;
    error: string;
    canonicalNotAbsolute: string;
    serpTitle: string;
    serpEmpty: string;
    shareTitle: string;
    structuredTitle: string;
    notEmitted: string;
  };
};

const CHANGE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;

export default function PageSeoEditor({
  adminLocale,
  projectId,
  slug,
  siteOrigin,
  perLocale,
  ogImageUrl: initialOgImage,
  heroImageUrl,
  canonicalUrl: initialCanonical,
  sitemapPriority: initialPriority,
  sitemapChangeFreq: initialFreq,
  structuredData,
  labels,
}: Props) {
  const router = useRouter();
  /* The one label on this screen whose value changes as you type — the
     rest are formatted on the server, where the numbers are already
     known. Same split as the rest of the admin. */
  const t = useTranslations("admin");

  const [active, setActive] = useState(perLocale[0]?.locale ?? "th");
  const [drafts, setDrafts] = useState<Record<string, LocaleSeo>>(() =>
    Object.fromEntries(perLocale.map((row) => [row.locale, row])),
  );

  const [ogImageUrl, setOgImageUrl] = useState(initialOgImage);
  const [canonicalUrl, setCanonicalUrl] = useState(initialCanonical);
  const [priority, setPriority] = useState(initialPriority?.toString() ?? "");
  const [changeFreq, setChangeFreq] = useState(initialFreq);

  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = drafts[active];

  const patch = (changes: Partial<LocaleSeo>) => {
    setStatus("idle");
    setDrafts((all) => ({ ...all, [active]: { ...all[active], ...changes } }));
  };

  const addKeyword = () => {
    const value = keywordDraft.trim();
    if (!value || current.keywords.includes(value)) {
      setKeywordDraft("");
      return;
    }
    patch({ keywords: [...current.keywords, value] });
    setKeywordDraft("");
  };

  const save = () => {
    setStatus("idle");
    setErrorKey(null);

    startTransition(async () => {
      const localeResult = await saveLocaleSeo(adminLocale, {
        projectId,
        locale: active,
        metaTitle: current.title,
        metaDescription: current.description,
        noIndex: current.noIndex,
        targetKeywords: current.keywords,
      });

      if (!localeResult.ok) {
        setStatus("error");
        setErrorKey(localeResult.error);
        return;
      }

      const projectResult = await saveProjectSeo(adminLocale, {
        projectId,
        ogImageUrl,
        canonicalUrl,
        sitemapPriority: priority.trim() === "" ? null : Number(priority),
        sitemapChangeFreq: changeFreq,
      });

      if (!projectResult.ok) {
        setStatus("error");
        setErrorKey(projectResult.error);
        return;
      }

      setStatus("saved");
      router.refresh();
    });
  };

  /* The search-result previews: the language being edited first, then any
     other language that has copy written. A language nobody has filled in
     is left out rather than shown blank — an empty result card looks like
     a rendering bug, not like a gap to fill. */
  const serpRows = useMemo(() => {
    const others = perLocale
      .filter((row) => row.locale !== active)
      .map((row) => drafts[row.locale])
      .filter((row) => row.title.trim().length > 0 || row.description.trim().length > 0);
    return [current, ...others];
  }, [current, drafts, perLocale, active]);

  const shareImage = ogImageUrl.trim() || heroImageUrl || "";

  const Counter = ({ value, limit }: { value: string; limit: number }) => (
    <p
      className={`mt-1 text-right text-xs tabular-nums ${
        value.length > limit ? "font-semibold text-red-700" : "text-ink-muted"
      }`}
    >
      {t("pageSeo.charCount", { count: value.length, limit })}
      {value.length > limit && ` · ${labels.tooLong}`}
    </p>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      {/* ── Settings ─────────────────────────────────────────────────── */}
      <section className="admin-card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-primary">{labels.sectionTitle}</h2>

          <div className="flex gap-1.5">
            {perLocale.map((row) => {
              const draft = drafts[row.locale];
              return (
                <button
                  key={row.locale}
                  type="button"
                  onClick={() => setActive(row.locale)}
                  aria-pressed={row.locale === active}
                  className={[
                    "rounded-xs border px-3 py-1.5 text-sm font-medium transition-colors",
                    row.locale === active
                      ? "border-primary bg-primary text-white"
                      : draft.title.trim() && draft.description.trim()
                        ? "border-primary/15 text-ink-muted hover:text-primary"
                        : // Incomplete languages are called out here rather
                          // than only in the checklist above.
                          "border-red-300 text-red-700",
                  ].join(" ")}
                >
                  {row.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="admin-label" htmlFor="seo-keyword">
            {labels.keywords} <span className="font-normal text-ink-muted">· {labels.keywordsHint}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {current.keywords.map((keyword) => (
              <span
                key={keyword}
                className="flex items-center gap-1.5 rounded-xs bg-surface-muted px-2.5 py-1.5 text-sm text-ink"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => patch({ keywords: current.keywords.filter((k) => k !== keyword) })}
                  aria-label={`${labels.keywords}: ${keyword}`}
                  className="text-ink-muted hover:text-red-600"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
            <input
              id="seo-keyword"
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addKeyword();
                }
              }}
              onBlur={addKeyword}
              placeholder={labels.addKeyword}
              className="admin-input w-auto! min-w-[140px] flex-1 border-dashed py-1.5! text-sm"
            />
          </div>
        </div>

        <div>
          <label className="admin-label" htmlFor="seo-title">
            {labels.title}
          </label>
          <input
            id="seo-title"
            value={current.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="admin-input"
          />
          <Counter value={current.title} limit={SEO_LIMITS.title} />
        </div>

        <div>
          <label className="admin-label" htmlFor="seo-description">
            {labels.description}
          </label>
          <textarea
            id="seo-description"
            rows={3}
            value={current.description}
            onChange={(event) => patch({ description: event.target.value })}
            className="admin-textarea min-h-0!"
          />
          <Counter value={current.description} limit={SEO_LIMITS.description} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="admin-label">{labels.url}</p>
            <p className="admin-input bg-surface-muted/60 font-mono text-sm text-ink-muted">
              /{active}/projects/<span className="font-semibold text-primary">{slug}</span>
            </p>
            <p className="admin-hint">{labels.urlHint}</p>
          </div>

          <div>
            <label className="admin-label" htmlFor="seo-canonical">
              {labels.canonical}
            </label>
            <input
              id="seo-canonical"
              value={canonicalUrl}
              onChange={(event) => {
                setStatus("idle");
                setCanonicalUrl(event.target.value);
              }}
              placeholder={`${siteOrigin}/${active}/projects/${slug}`}
              className="admin-input font-mono text-xs"
            />
            <p className="admin-hint">{labels.canonicalHint}</p>
          </div>
        </div>

        <ImageUploader
          name="ogImageUrl"
          prefix="projects"
          slug={slug}
          defaultValue={initialOgImage}
          label={labels.shareImage}
          hint={labels.shareImageFallback}
          onChange={(value) => {
            setStatus("idle");
            setOgImageUrl(value);
          }}
        />

        <div className="grid max-w-xs grid-cols-2 gap-3">
          <div>
            <label className="admin-label" htmlFor="seo-priority">
              {labels.sitemapPriority}
            </label>
            <input
              id="seo-priority"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={priority}
              onChange={(event) => {
                setStatus("idle");
                setPriority(event.target.value);
              }}
              placeholder={labels.useDefault}
              className="admin-input py-2! text-sm"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="seo-freq">
              {labels.sitemapChangeFreq}
            </label>
            <select
              id="seo-freq"
              value={changeFreq}
              onChange={(event) => {
                setStatus("idle");
                setChangeFreq(event.target.value);
              }}
              className="admin-input py-2! text-sm"
            >
              <option value="">{labels.useDefault}</option>
              {CHANGE_FREQUENCIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-primary/10 pt-4">
          <div>
            <p className="text-sm font-medium text-primary">{labels.noIndex}</p>
            <p className="admin-hint">{labels.noIndexHint}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!current.noIndex}
            aria-label={labels.noIndex}
            onClick={() => patch({ noIndex: !current.noIndex })}
            className={[
              "relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              current.noIndex ? "bg-primary/20" : "bg-emerald-500",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform",
                current.noIndex ? "translate-x-[3px]" : "translate-x-[18px]",
              ].join(" ")}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending} className="admin-btn py-2! text-sm">
            {pending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Check size={14} aria-hidden />
            )}
            {labels.save}
          </button>

          {status === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-700">
              <Check size={13} aria-hidden />
              {labels.saved}
            </span>
          )}

          {status === "error" && (
            <span className="flex items-center gap-1.5 text-xs text-red-700">
              <AlertCircle size={13} aria-hidden />
              {errorKey === "CANONICAL_NOT_ABSOLUTE" ? labels.canonicalNotAbsolute : labels.error}
            </span>
          )}
        </div>
      </section>

      {/* ── Previews ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <section className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-primary">{labels.serpTitle}</h2>

          {serpRows.map((row) => (
            <div key={row.locale} className="rounded-xs border border-primary/10 p-3.5">
              <p className="text-xs text-ink-muted">
                {siteOrigin.replace(/^https?:\/\//, "")} › {row.locale} › projects
              </p>
              <p className="mt-1 truncate text-lg text-[#1a0dab]">
                {row.title.trim() || labels.serpEmpty}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                {row.description.trim() || labels.serpEmpty}
              </p>
              {row.noIndex && (
                <p className="mt-1.5 text-xs font-medium text-red-700">{labels.noIndex} — off</p>
              )}
            </div>
          ))}
        </section>

        <section className="admin-card space-y-3">
          <h2 className="text-sm font-semibold text-primary">{labels.shareTitle}</h2>

          <div className="overflow-hidden rounded-xs border border-primary/10">
            {shareImage ? (
              /* Plain <img>, like every other admin preview. */
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shareImage} alt="" className="h-40 w-full bg-surface-muted object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center bg-surface-muted text-ink-muted">
                <ImageIcon size={20} aria-hidden />
              </div>
            )}
            <div className="bg-surface-muted/60 px-3.5 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                {siteOrigin.replace(/^https?:\/\//, "")}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-primary">
                {current.title.trim() || labels.serpEmpty}
              </p>
              <p className="line-clamp-2 text-xs text-ink-muted">
                {current.description.trim() || labels.serpEmpty}
              </p>
            </div>
          </div>
        </section>

        <section className="admin-card space-y-3">
          <h2 className="text-sm font-semibold text-primary">{labels.structuredTitle}</h2>

          <ul className="space-y-2">
            {structuredData.map((entry) => (
              <li key={entry.type} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  {entry.emitted ? (
                    <Check size={14} className="text-emerald-600" aria-hidden />
                  ) : (
                    <X size={14} className="text-ink-muted/60" aria-hidden />
                  )}
                  <span className={entry.emitted ? "text-primary" : "text-ink-muted/70"}>
                    {entry.type}
                  </span>
                </span>
                <span className="text-right text-xs text-ink-muted">
                  {entry.emitted ? entry.detail : labels.notEmitted}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
