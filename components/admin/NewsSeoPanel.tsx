"use client";

/**
 * components/admin/NewsSeoPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The news editor's sticky inspector, in 5 tabs: SEO (score, checklist,
 * SERP/OG previews), Keywords (focus-keyword density, secondary keywords,
 * LSI terms), Links (the body's own internal/external links, live, plus
 * link-opportunity and inbound-link data from lib/admin/link-opportunities.ts),
 * Settings (noIndex, share image, schema type, canonical URL), and Schema
 * (the exact JSON-LD the public page will embed, plus its breadcrumb).
 *
 * Everything here is computed by lib/article-seo.ts, lib/keyword-density.ts,
 * lib/content-stats.ts and lib/article-schema.ts straight from what the
 * editor has typed so far — still no AI-translation numbers, because
 * nothing in this codebase generates them. Search volume/difficulty/rank
 * ARE shown, but only when the focus keyword matches a Keyword row a rank
 * import has actually populated (lib/keywords/rank-updates.ts) — real
 * numbers from the last CSV import, not a live Google check, and the UI
 * says so next to them rather than letting them pass for real-time.
 *
 * `values` mirrors NewsForm's own field state rather than reading the DOM
 * — see NewsForm's header comment for which fields are live and which
 * (excerpt) are a snapshot from page load. `languageComplete` arrives
 * pre-computed from the server: the real per-locale check
 * (lib/admin/news-list.ts's localeStatesOf) is "server-only", and this is
 * a "use client" component that recomputes on every keystroke.
 *
 * The expensive recompute (auditArticle/getContentStats/getKeywordDensity)
 * runs on a 300ms debounce of `values`, not on every render — the input
 * fields themselves stay exactly as responsive as before this existed;
 * only the derived checklist/score/previews lag by up to 300ms.
 * onSeoResultChange fires alongside that same debounced recompute, so
 * NewsForm's publish-gate UI updates in step with what this panel shows
 * rather than reacting to every keystroke on its own.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Link2, Loader2, XCircle } from "lucide-react";
import { Role } from "@prisma/client";
import ImageUploader from "@/components/admin/ImageUploader";
import SeoPreviewFields from "@/components/admin/SeoPreviewFields";
import OgPreviewCard from "@/components/admin/OgPreviewCard";
import { extractCheckableLinks, getContentStats, getPlainText, type ContentFormat } from "@/lib/content-stats";
import { getKeywordDensity } from "@/lib/keyword-density";
import { auditArticle, type SeoCheck, type SeoScoreResult } from "@/lib/article-seo";
import { buildArticleJsonLd } from "@/lib/article-schema";
import { SEO_LIMITS } from "@/lib/seo-limits";
import { relativeTime } from "@/lib/relative-time";
import { trailFor } from "@/lib/seo";
import { MAX_SECONDARY_KEYWORDS } from "@/lib/validations";
import {
  getKeywordForPhrase,
  upsertLsiTerms,
  type TrackedKeyword,
} from "@/app/[locale]/admin/(content)/news/keyword-lsi-actions";
import type { addLinkOpportunity } from "@/app/[locale]/admin/(growth)/seo/links/actions";
import type { ArticleLinkPanel } from "@/lib/admin/link-opportunities";
import { hasRole } from "@/lib/role-rank";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n";

export type NewsSeoPanelValues = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  /** A snapshot from page load, not a live mirror — see the file header. */
  excerpt: string;
  focusKeyword: string;
  content: string;
  coverImageUrl: string;
  ogImageUrl: string;
  schemaType: string;
  canonicalUrl: string;
  secondaryKeywords: string;
};

type Props = {
  lang: Locale;
  values: NewsSeoPanelValues;
  contentFormat: ContentFormat;
  languageComplete: boolean;
  onFocusKeywordChange: (value: string) => void;
  onMetaTitleChange: (value: string) => void;
  onMetaDescriptionChange: (value: string) => void;
  onOgImageUrlChange: (value: string) => void;
  onSchemaTypeChange: (value: string) => void;
  onCanonicalUrlChange: (value: string) => void;
  onSecondaryKeywordsChange: (value: string) => void;
  /** Fires whenever the debounced score/checklist recomputes — see the
   *  file header. NewsForm's publish-gate UI reads this. */
  onSeoResultChange?: (result: SeoScoreResult) => void;
  metaTitleError?: string | null;
  metaDescriptionError?: string | null;
  focusKeywordError?: string | null;
  noIndexDefaultChecked: boolean;
  /** The current admin's role — gates the Links tab's "Add link" button
   *  to ADMIN, matching the phase's binding decision. Unlike
   *  /admin/seo/links (ADMIN-only to even open), this editor is reachable
   *  down to VIEWER, so the button needs its own check here. */
  role: Role;
  /** Which admin-UI locale this session is browsing in — distinct from
   *  `lang` (which translation is being edited), the same distinction
   *  KeywordRankImportPanel's uiLocale/keywordLocale split already makes.
   *  Passed through to addLinkAction's revalidation. */
  uiLocale: string;
  /** "Should link to" / inbound links / external-link status — computed
   *  server-side (lib/admin/link-opportunities.ts's getArticleLinkPanel is
   *  a DB round trip this client component can't make itself) and handed
   *  in as a plain snapshot, current as of the last save-and-rescan. */
  linkPanel: ArticleLinkPanel;
  addLinkAction: typeof addLinkOpportunity;
};

type Tab = "seo" | "keywords" | "links" | "settings" | "schema";

const SCHEMA_TYPES = ["NewsArticle", "BlogPosting", "Report"] as const;

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-700";
}

function scoreStroke(score: number): string {
  if (score >= 80) return "#047857"; // emerald-700
  if (score >= 60) return "#b45309"; // amber-700
  return "#b91c1c"; // red-700
}

/** Same thresholds as scoreColor/scoreStroke, so the label never disagrees
 *  with the ring's own colour. A holistic read of the score, not "every
 *  must-fix item is gone" — the checklist below already says that on its
 *  own terms. */
function scoreStatusKey(score: number): "ready" | "needsWork" | "notReady" {
  if (score >= 80) return "ready";
  if (score >= 60) return "needsWork";
  return "notReady";
}

function densityColor(density: number): string {
  if (density === 0) return "text-ink-muted";
  if (density >= 0.8 && density <= 2.5) return "text-emerald-700";
  return "text-amber-700";
}

/** A minimal donut — no charting dependency for one static ring. */
function ScoreDonut({ score }: { score: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" role="img" aria-label={`${score}/100`}>
      <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-primary/10" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke={scoreStroke(score)}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" className={`text-[18px] font-semibold tabular-nums ${scoreColor(score)}`} fill="currentColor">
        {score}
      </text>
    </svg>
  );
}

/** Only bodyLength's message interpolates {count} — every other check's
 *  copy is static. */
function checkArgs(id: string, wordCount: number): { count: number } | undefined {
  return id === "bodyLength" ? { count: wordCount } : undefined;
}

function ChecklistGroup({ title, checks, wordCount, icon, t }: {
  title: string;
  checks: SeoCheck[];
  wordCount: number;
  icon: React.ReactNode;
  t: ReturnType<typeof useTranslations>;
}) {
  if (checks.length === 0) return null;

  return (
    <div>
      <h4 className="admin-label">{title}</h4>
      <ul className="mt-1.5 space-y-2">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-sm">
            {icon}
            <span className="text-ink">{t(`news.seo.checks.${check.id}`, checkArgs(check.id, wordCount))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NewsSeoPanel({
  lang,
  values,
  contentFormat,
  languageComplete,
  onFocusKeywordChange,
  onMetaTitleChange,
  onMetaDescriptionChange,
  onOgImageUrlChange,
  onSchemaTypeChange,
  onCanonicalUrlChange,
  onSecondaryKeywordsChange,
  onSeoResultChange,
  metaTitleError,
  metaDescriptionError,
  focusKeywordError,
  noIndexDefaultChecked,
  role,
  uiLocale,
  linkPanel,
  addLinkAction,
}: Props) {
  const t = useTranslations("admin");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("seo");
  const [addLinkPending, startAddLinkTransition] = useTransition();
  const [addLinkError, setAddLinkError] = useState<string | null>(null);
  const canAddLink = hasRole(role, Role.ADMIN);

  function onAddLink(opportunity: ArticleLinkPanel["opportunities"][number]) {
    setAddLinkError(null);
    startAddLinkTransition(async () => {
      const result = await addLinkAction(
        {
          sourceId: opportunity.sourceId,
          sourceLocale: opportunity.sourceLocale,
          targetType: opportunity.targetType,
          targetId: opportunity.targetId,
          targetPath: opportunity.targetPath,
        },
        uiLocale,
      );
      if (result.ok) router.refresh();
      else setAddLinkError(t("seo.links.addLinkError"));
    });
  }

  // Debounced copy of `values` for the expensive recompute below — the
  // input fields themselves read straight from `values`/the on*Change
  // callbacks, unaffected by this delay. See the file header.
  const [debounced, setDebounced] = useState(values);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(values), 300);
    return () => clearTimeout(id);
  }, [values]);

  const stats = useMemo(
    () => getContentStats(debounced.content, contentFormat),
    [debounced.content, contentFormat],
  );

  const links = useMemo(() => extractCheckableLinks(debounced.content), [debounced.content]);

  // Live, not debounced — a plain comma split is cheap enough to run on
  // every keystroke, and the count hint should feel immediate.
  const secondaryKeywordCount = values.secondaryKeywords.split(",").map((k) => k.trim()).filter(Boolean).length;

  const density = useMemo(
    () => getKeywordDensity(getPlainText(debounced.content, contentFormat), debounced.focusKeyword),
    [debounced.content, contentFormat, debounced.focusKeyword],
  );

  // LSI suggestions — the one place this panel talks to the server
  // directly rather than purely deriving from `values`/`debounced`: a
  // tracked Keyword's lsiTerms lives in its own table, not in anything
  // NewsForm already tracks. Same debounce-then-server-action shape as
  // InternalLinkModal's own search.
  const [lsiTerms, setLsiTerms] = useState("");
  const [lsiTracked, setLsiTracked] = useState(false);
  const [lsiSaved, setLsiSaved] = useState(false);
  const [lsiPending, startLsiTransition] = useTransition();
  /** The same tracked Keyword row the LSI lookup above already fetches —
   *  search volume/difficulty/rank ride along on it rather than a second
   *  round trip. Null fields mean "never in a rank-tracking import", not
   *  zero — see keyword-lsi-actions.ts's TrackedKeyword. */
  const [trackedKeyword, setTrackedKeyword] = useState<TrackedKeyword | null>(null);

  useEffect(() => {
    const phrase = debounced.focusKeyword.trim();
    setLsiSaved(false);
    if (!phrase) {
      setLsiTerms("");
      setLsiTracked(false);
      setTrackedKeyword(null);
      return;
    }
    startLsiTransition(async () => {
      const row = await getKeywordForPhrase(phrase, lang);
      setLsiTracked(row !== null);
      setLsiTerms(row?.lsiTerms.join(", ") ?? "");
      setTrackedKeyword(row);
    });
  }, [debounced.focusKeyword, lang]);

  function saveLsiTerms() {
    const phrase = debounced.focusKeyword.trim();
    if (!phrase) return;
    startLsiTransition(async () => {
      const result = await upsertLsiTerms(
        phrase,
        lang,
        lsiTerms.split(",").map((term) => term.trim()).filter(Boolean),
      );
      if (result.ok) {
        setLsiTracked(true);
        setLsiSaved(true);
      }
    });
  }

  const seo = useMemo(
    () =>
      auditArticle({
        title: debounced.title,
        metaTitle: debounced.metaTitle,
        metaDescription: debounced.metaDescription,
        slug: debounced.slug,
        excerpt: debounced.excerpt,
        focusKeyword: debounced.focusKeyword,
        content: debounced.content,
        contentFormat,
        coverImageUrl: debounced.coverImageUrl || null,
        ogImageUrl: debounced.ogImageUrl || null,
        languageComplete,
      }),
    [debounced, contentFormat, languageComplete],
  );

  useEffect(() => {
    onSeoResultChange?.(seo);
    // onSeoResultChange is a setState function from the parent — stable
    // across renders, and including it would refire this for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seo]);

  const mustFix = seo.checks.filter((c) => c.status === "fail");
  const shouldFix = seo.checks.filter((c) => c.status === "warn");
  const passed = seo.checks.filter((c) => c.status === "pass");

  const schemaJsonLd = useMemo(
    () =>
      buildArticleJsonLd(
        {
          url: `${siteConfig.url}/${lang}/news/${debounced.slug || "…"}`,
          schemaType: debounced.schemaType || "NewsArticle",
          title: debounced.title || t("projects.seoPreviewNoTitle"),
          metaDescription: debounced.metaDescription || debounced.excerpt,
          coverImageUrl: debounced.coverImageUrl || null,
          publishedAt: null,
          updatedAt: new Date(),
          locale: lang,
          category: null,
          tags: [],
          authorName: null,
          content: debounced.content,
        },
        { legalName: siteConfig.legalName, siteUrl: siteConfig.url, logoUrl: null },
      ),
    [debounced, lang, t],
  );

  /** The exact trail the public article page itself builds (see
   *  app/[locale]/(site)/news/[slug]/page.tsx) — three levels, no category
   *  step, since the real page has none. */
  const breadcrumbTrail = useMemo(
    () =>
      trailFor(lang, [
        { name: tNav("home"), path: "" },
        { name: tNav("news"), path: "/news" },
        { name: debounced.title || t("projects.seoPreviewNoTitle"), path: `/news/${debounced.slug || "…"}` },
      ]),
    [lang, tNav, debounced.title, debounced.slug, t],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "seo", label: t("news.seo.tabSeo") },
    { id: "keywords", label: t("news.seo.tabKeywords") },
    { id: "links", label: t("news.seo.tabLinks") },
    { id: "settings", label: t("news.seo.tabSettings") },
    { id: "schema", label: t("news.seo.tabSchema") },
  ];

  return (
    <div className="admin-card space-y-5 lg:sticky lg:top-6">
      <div role="tablist" aria-label={t("projects.seo")} className="flex flex-wrap gap-1 border-b border-primary/10 pb-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-t-xs px-3 py-2 text-xs font-medium transition-colors ${
              tab === id ? "border-b-2 border-primary text-primary" : "text-ink-muted hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "seo" && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <ScoreDonut score={seo.score} />
            <div>
              <p className={`text-sm font-semibold ${scoreColor(seo.score)}`}>
                {t(`news.seo.scoreStatus.${scoreStatusKey(seo.score)}`)}
              </p>
              <p className="text-xs text-ink-muted">{t("news.seo.scoreHint")}</p>
            </div>
          </div>

          <div>
            <label htmlFor="focusKeyword" className="admin-label">
              {t("news.seo.focusKeyword")}
            </label>
            <input
              id="focusKeyword"
              name="focusKeyword"
              value={values.focusKeyword}
              onChange={(event) => onFocusKeywordChange(event.target.value)}
              className="admin-input"
            />
            {focusKeywordError ? (
              <p className="mt-1.5 text-xs text-red-700">{focusKeywordError}</p>
            ) : (
              <p className="admin-hint">{t("news.seo.focusKeywordHint")}</p>
            )}
            {trackedKeyword &&
              (trackedKeyword.searchVolume !== null ||
                trackedKeyword.difficulty !== null ||
                trackedKeyword.currentRank !== null) && (
                <p className="mt-1.5 text-xs text-ink-muted">
                  {[
                    trackedKeyword.searchVolume !== null &&
                      t("news.seo.keywordSearchVolume", { count: trackedKeyword.searchVolume }),
                    trackedKeyword.difficulty !== null &&
                      t("news.seo.keywordDifficulty", { value: trackedKeyword.difficulty }),
                    trackedKeyword.currentRank !== null &&
                      t("news.seo.keywordCurrentRank", { rank: trackedKeyword.currentRank }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  <span className="block">{t("news.seo.keywordStatsCaveat")}</span>
                </p>
              )}
          </div>

          <div className="space-y-4 border-t border-primary/10 pt-5">
            <SeoPreviewFields
              titleLabel={`${t("projects.metaTitle")} · ${lang.toUpperCase()}`}
              descriptionLabel={`${t("projects.metaDescription")} · ${lang.toUpperCase()}`}
              titleError={metaTitleError}
              descriptionError={metaDescriptionError}
              defaultTitle={values.metaTitle}
              defaultDescription={values.metaDescription}
              title={values.metaTitle}
              onTitleChange={onMetaTitleChange}
              description={values.metaDescription}
              onDescriptionChange={onMetaDescriptionChange}
              fallbackTitle={values.title || t("projects.seoPreviewNoTitle")}
              fallbackDescription={values.excerpt || t("projects.seoPreviewNoDescription")}
              displayPath={`${siteConfig.url.replace(/^https?:\/\//, "")} › ${lang} › news${values.slug ? ` › ${values.slug}` : ""}`}
              previewLabel={t("projects.seoPreviewLabel")}
              previewHint={t("projects.seoPreviewHint")}
              focusKeyword={values.focusKeyword}
              titleLengthHint={t("news.seo.idealLengthHint", { min: SEO_LIMITS.titleMin, max: SEO_LIMITS.title })}
              descriptionLengthHint={t("news.seo.idealLengthHint", {
                min: SEO_LIMITS.descriptionMin,
                max: SEO_LIMITS.description,
              })}
            />

            <OgPreviewCard
              title={values.metaTitle || values.title || t("projects.seoPreviewNoTitle")}
              description={values.metaDescription || values.excerpt || t("projects.seoPreviewNoDescription")}
              imageUrl={values.ogImageUrl || values.coverImageUrl || null}
              siteUrl={siteConfig.url}
              focusKeyword={values.focusKeyword}
              label={t("news.seo.ogPreviewLabel")}
              hint={t("news.seo.ogPreviewHint")}
            />
          </div>

          <div className="border-t border-primary/10 pt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="admin-section-title">{t("news.seo.checklistTitle")}</h3>
              <span className="text-xs text-ink-muted">
                {t("news.seo.checklistSummary", {
                  passed: passed.length,
                  shouldFix: shouldFix.length,
                  mustFix: mustFix.length,
                  total: seo.checks.length,
                })}
              </span>
            </div>

            <div className="space-y-4">
              <ChecklistGroup
                title={t("news.seo.mustFix")}
                checks={mustFix}
                wordCount={stats.wordCount}
                icon={<XCircle size={15} className="mt-0.5 shrink-0 text-red-500" aria-hidden />}
                t={t}
              />
              <ChecklistGroup
                title={t("news.seo.shouldFix")}
                checks={shouldFix}
                wordCount={stats.wordCount}
                icon={<AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />}
                t={t}
              />
              <ChecklistGroup
                title={t("news.seo.passedGroup")}
                checks={passed}
                wordCount={stats.wordCount}
                icon={<CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />}
                t={t}
              />
            </div>
          </div>

          <div className="border-t border-primary/10 pt-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">{t("news.seo.statsWords")}</dt>
                <dd className="tabular-nums text-ink">{stats.wordCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t("news.seo.statsReadingTime")}</dt>
                <dd className="text-ink">{t("news.readingTime", { minutes: stats.readingMinutes })}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t("news.seo.statsImages")}</dt>
                <dd className="tabular-nums text-ink">{stats.imageCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t("news.seo.statsAvgSentence")}</dt>
                <dd className="text-ink">{t("news.seo.statsWordsCount", { count: stats.averageSentenceLength })}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <h4 className="admin-label">{t("news.seo.outlineTitle")}</h4>
              {stats.headings.length === 0 ? (
                <p className="admin-hint">{t("news.seo.outlineEmpty")}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {stats.headings.map((heading, index) => (
                    <li
                      key={index}
                      style={{ paddingLeft: `${(heading.level - 1) * 0.65}rem` }}
                      className={`flex items-center gap-1.5 truncate text-sm ${
                        heading.skipsLevel ? "text-amber-700" : "text-ink"
                      }`}
                    >
                      <span className="shrink-0 text-xs text-ink-muted">H{heading.level}</span>
                      <span className="truncate">{heading.text}</span>
                      {heading.skipsLevel && <AlertTriangle size={12} className="shrink-0 text-amber-600" aria-hidden />}
                    </li>
                  ))}
                </ul>
              )}
              {stats.headings.some((heading) => heading.skipsLevel) && (
                <p className="mt-2 text-xs text-amber-700">{t("news.seo.outlineWarning")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "keywords" && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="admin-section-title">{t("news.seo.tabKeywords")}</h3>
            <span className="text-xs text-ink-muted">{t("news.seo.densityTarget")}</span>
          </div>

          {values.focusKeyword.trim() ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="admin-th">{t("news.seo.densityKeywordHeader")}</th>
                  <th className="admin-th">{t("news.seo.densityCountHeader")}</th>
                  <th className="admin-th">{t("news.seo.densityPercentHeader")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="admin-td">{values.focusKeyword}</td>
                  <td className="admin-td tabular-nums">{density.count}</td>
                  <td className={`admin-td tabular-nums font-medium ${densityColor(density.density)}`}>
                    {density.density.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="admin-hint">{t("news.seo.densityEmpty")}</p>
          )}

          <div className="border-t border-primary/10 pt-5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="secondaryKeywordsInput" className="admin-label">
                {t("news.seo.secondaryKeywordsLabel")}
              </label>
              <span
                className={`text-xs tabular-nums ${
                  secondaryKeywordCount > MAX_SECONDARY_KEYWORDS ? "text-red-700" : "text-ink-muted"
                }`}
              >
                {secondaryKeywordCount}/{MAX_SECONDARY_KEYWORDS}
              </span>
            </div>
            <input
              id="secondaryKeywordsInput"
              value={values.secondaryKeywords}
              onChange={(event) => onSecondaryKeywordsChange(event.target.value)}
              className="admin-input"
            />
            <p className="admin-hint">{t("news.seo.secondaryKeywordsHint")}</p>
          </div>

          {/* TODO(Phase 7?): AI-assisted translation into the other 3
              locales from this article's own primary-language draft — same
              "admin fills it in manually, no external API yet" scope this
              LSI section below already accepts for keyword suggestions. */}
          <div className="border-t border-primary/10 pt-5">
            <label htmlFor="lsiTermsInput" className="admin-label">
              {t("news.seo.lsiLabel")}
            </label>
            {values.focusKeyword.trim() ? (
              <>
                <input
                  id="lsiTermsInput"
                  value={lsiTerms}
                  onChange={(event) => {
                    setLsiTerms(event.target.value);
                    setLsiSaved(false);
                  }}
                  className="admin-input"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveLsiTerms}
                    disabled={lsiPending}
                    className="admin-btn-ghost py-1.5! text-xs"
                  >
                    {lsiPending && <Loader2 size={12} className="animate-spin" aria-hidden />}
                    {t("common.save")}
                  </button>
                  {lsiSaved && <span className="text-xs text-emerald-700">{t("common.saved")}</span>}
                </div>
                <p className="admin-hint">
                  {lsiTracked ? t("news.seo.lsiHint") : t("news.seo.lsiHintUntracked")}
                </p>
              </>
            ) : (
              <p className="admin-hint">{t("news.seo.lsiHintNoFocusKeyword")}</p>
            )}
          </div>
        </div>
      )}

      {tab === "links" && (
        <div className="space-y-5">
          <h3 className="admin-section-title">{t("news.seo.tabLinks")}</h3>

          {links.length === 0 ? (
            <p className="admin-hint">{t("news.seo.linksEmpty")}</p>
          ) : (
            <>
              <div>
                <h4 className="admin-label">
                  {t("news.seo.linksInternalHeading")} ({links.filter((l) => l.internal).length})
                </h4>
                <ul className="mt-1.5 space-y-1">
                  {links
                    .filter((l) => l.internal)
                    .map((l, index) => (
                      <li key={index} className="truncate text-sm text-ink">
                        {l.target}
                      </li>
                    ))}
                </ul>
              </div>

              <div className="border-t border-primary/10 pt-4">
                <h4 className="admin-label">
                  {t("news.seo.linksExternalHeading")} ({links.filter((l) => !l.internal).length})
                </h4>
                <ul className="mt-1.5 space-y-1">
                  {links
                    .filter((l) => !l.internal)
                    .map((l, index) => {
                      const entry = linkPanel.externalStatuses[l.target];
                      const checked = typeof entry?.status === "number";
                      const broken = checked && !(entry!.status! >= 200 && entry!.status! < 400);
                      return (
                        <li key={index} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink">
                          <span className="truncate">{l.target}</span>
                          {checked && (
                            <span
                              className={`shrink-0 rounded-xs px-1.5 py-0.5 text-[10px] font-semibold ${
                                broken ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {entry!.status === 0 ? <AlertTriangle size={10} aria-hidden /> : entry!.status}
                            </span>
                          )}
                          {entry?.checkedAt && (
                            <span className="shrink-0 text-[11px] text-ink-muted">
                              {t("news.seo.linksCheckedAt", { when: relativeTime(uiLocale, entry.checkedAt) })}
                            </span>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>
            </>
          )}

          {/* ── Should link to ───────────────────────────────────────── */}
          <div className="border-t border-primary/10 pt-4">
            <h4 className="admin-label">
              {t("news.seo.linksOpportunitiesHeading")} ({linkPanel.opportunities.length})
            </h4>
            {linkPanel.opportunities.length === 0 ? (
              <p className="admin-hint">{t("news.seo.linksOpportunitiesEmpty")}</p>
            ) : (
              <ul className="mt-1.5 space-y-2">
                {linkPanel.opportunities.map((opportunity) => (
                  <li key={opportunity.id} className="flex items-center justify-between gap-2 text-sm text-ink">
                    <span className="min-w-0 truncate">
                      <span className="mr-1.5 shrink-0 rounded-xs bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                        {t(`news.seo.targetType.${opportunity.targetType}` as never)}
                      </span>
                      {opportunity.targetTitle}{" "}
                      <span className="text-ink-muted">— “{opportunity.matchedText}”</span>
                    </span>
                    {canAddLink && (
                      <button
                        type="button"
                        disabled={addLinkPending}
                        onClick={() => onAddLink(opportunity)}
                        className="admin-btn-ghost shrink-0 py-1! text-xs disabled:opacity-60"
                      >
                        {addLinkPending ? (
                          <Loader2 size={12} className="animate-spin" aria-hidden />
                        ) : (
                          <Link2 size={12} aria-hidden />
                        )}
                        {t("seo.links.addLinkButton")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {addLinkError && <p className="mt-1.5 text-xs text-red-700">{addLinkError}</p>}
          </div>

          {/* ── Inbound links ────────────────────────────────────────── */}
          <div className="border-t border-primary/10 pt-4">
            <h4 className="admin-label">
              {t("news.seo.linksInboundHeading")} ({linkPanel.inboundLinks.length})
            </h4>
            {linkPanel.inboundLinks.length === 0 ? (
              <p className="admin-hint">{t("news.seo.linksInboundEmpty")}</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {linkPanel.inboundLinks.map((inbound, index) => (
                  <li key={index} className="truncate text-sm text-ink">
                    {inbound.label}
                    {inbound.anchorText && (
                      <span className="text-ink-muted"> — “{inbound.anchorText}”</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-5">
          <h3 className="admin-section-title">{t("news.seo.tabSettings")}</h3>

          <ImageUploader
            name="ogImageUrl"
            prefix="news"
            slug={values.slug}
            defaultValue={values.ogImageUrl}
            onChange={onOgImageUrlChange}
            label={t("news.ogImage")}
            hint={t("news.ogImageHint")}
          />

          <label className="flex items-start gap-3 border-t border-primary/10 pt-5 text-sm text-ink">
            <input
              type="checkbox"
              name="noIndex"
              defaultChecked={noIndexDefaultChecked}
              className="mt-0.5 h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
            />
            <span>
              {t("projects.noIndex")}
              <span className="mt-0.5 block text-xs text-ink-muted">
                {t("projects.noIndexHint")} · {lang.toUpperCase()}
              </span>
            </span>
          </label>

          <div className="border-t border-primary/10 pt-5">
            <label htmlFor="schemaTypeSelect" className="admin-label">
              {t("news.seo.schemaTypeLabel")}
            </label>
            <select
              id="schemaTypeSelect"
              value={values.schemaType}
              onChange={(event) => onSchemaTypeChange(event.target.value)}
              className="admin-input"
            >
              {SCHEMA_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`news.seo.schemaTypeOptions.${value}`)}
                </option>
              ))}
            </select>
            <p className="admin-hint">{t("news.seo.schemaTypeHint")}</p>
          </div>

          <div>
            <label htmlFor="canonicalUrlInput" className="admin-label">
              {t("news.seo.canonicalUrlLabel")}
            </label>
            <input
              id="canonicalUrlInput"
              value={values.canonicalUrl}
              onChange={(event) => onCanonicalUrlChange(event.target.value)}
              className="admin-input"
            />
            <p className="admin-hint">{t("news.seo.canonicalUrlHint")}</p>
          </div>
        </div>
      )}

      {tab === "schema" && (
        <div className="space-y-4">
          <div>
            <h3 className="admin-section-title">{t("news.seo.schemaPreviewTitle")}</h3>
            <p className="admin-hint">{t("news.seo.schemaPreviewHint")}</p>
          </div>

          <p className="text-sm text-ink">
            <span className="text-ink-muted">{t("news.seo.schemaPreviewType")}: </span>
            <span className="font-medium">{schemaJsonLd.map((entry) => entry["@type"]).join(" + ")}</span>
          </p>

          <pre className="max-h-96 overflow-auto rounded-xs border border-primary/10 bg-surface-muted/40 p-3 text-xs leading-relaxed text-ink">
            {JSON.stringify(schemaJsonLd, null, 2)}
          </pre>

          <div className="border-t border-primary/10 pt-4">
            <h4 className="admin-label">{t("news.seo.breadcrumbTitle")}</h4>
            <p className="mt-1 truncate text-sm text-ink">
              {breadcrumbTrail.map((item) => item.name).join(" › ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
