"use client";

/**
 * components/admin/NewsForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Article editor. Body is one of two things depending on `contentFormat`
 * (schema.prisma's ArticleFormat): a plain Markdown textarea with
 * MarkdownToolbar (old articles, unchanged from before this file's rich
 * text editor existed), or components/admin/RichTextEditor.tsx's TipTap
 * instance (new articles, and old ones an editor has explicitly converted
 * via the banner below — never automatically, per this feature's own
 * requirement). Both write into the same `content` state and submit
 * through the same `name="content"` field, so createArticle/updateArticle
 * need no awareness of which editor produced it beyond the `contentFormat`
 * field riding alongside.
 *
 * title/excerpt/content/metaTitle/metaDescription/focusKeyword are
 * translated — see NewsArticleTranslation in schema.prisma. `lang` selects
 * which locale this instance shows/saves; the edit page owns the language
 * selector — see AwardForm's file comment for the fuller version of this
 * note.
 *
 * title/metaTitle/metaDescription/slug/focusKeyword/content/coverImageUrl/
 * ogImageUrl are mirrored into local state — the same reason BodyField's
 * live character count already needed content mirrored — so that
 * NewsSeoPanel's live score/checklist/density/stats have something to
 * recompute from on every keystroke. `excerpt` is deliberately left as an
 * uncontrolled field: the SEO checklist's excerpt-length check reads its
 * value at page load, and re-checking it live was not worth a seventh
 * piece of mirrored state for a field that rarely changes after it is
 * first written.
 *
 * TITLE ↔ FIRST-H1 SYNC (rich-text mode only — see lib/heading-policy.ts)
 *
 * The public page already renders the article's `title` field as its own
 * H1, so the first H1 an editor types into the body *is* the title, not a
 * second one. `onFirstH1TextChange` below is the body→title direction
 * (RichTextEditor reports it on every update); the title `<input>`'s own
 * onChange is the reverse, via the editor ref's `setFirstHeadingText` —
 * which is a no-op unless a first H1 already exists, so typing a title
 * never *creates* a heading out of nowhere.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { marked } from "marked";
import { Role } from "@prisma/client";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import MarkdownToolbar from "@/components/admin/MarkdownToolbar";
import NewsSeoPanel from "@/components/admin/NewsSeoPanel";
import type { addLinkOpportunity } from "@/app/[locale]/admin/(growth)/seo/links/actions";
import type { ArticleLinkPanel } from "@/lib/admin/link-opportunities";
import RichTextEditor, {
  type RichTextEditorHandle,
  type InsertedLink,
  type InsertedImage,
} from "@/components/admin/RichTextEditor";
import InternalLinkModal from "@/components/admin/InternalLinkModal";
import InsertImageModal from "@/components/admin/InsertImageModal";
import SaveToast from "@/components/admin/SaveToast";
import SlugField from "@/components/admin/SlugField";
import DateTimeField from "@/components/admin/DateTimeField";
import { readingMinutes } from "@/lib/markdown-text";
import { getContentStats, type ContentFormat } from "@/lib/content-stats";
import type { SeoScoreResult } from "@/lib/article-seo";
import { hasRole } from "@/lib/role-rank";
import type { Locale } from "@/i18n";
import type { NewsFormState } from "@/app/[locale]/admin/(content)/news/actions";

export type NewsFormValues = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  /** Which editor `content` belongs to — see the file header. */
  contentFormat: ContentFormat;
  coverImageUrl: string;
  /** Manual social-share override — see NewsArticle.ogImageUrl's
   *  schema.prisma comment. Falls back to coverImageUrl when empty. */
  ogImageUrl: string;
  category: string;
  tags: string;
  metaTitle: string;
  metaDescription: string;
  /** The phrase this locale's version is written to rank for — see the
   *  schema.prisma comment on NewsArticleTranslation.focusKeyword. */
  focusKeyword: string;
  noIndex: boolean;
  isPublished: boolean;
  /** "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
  publishedAt: string;
  /** JSON-LD @type this article emits — see lib/article-schema.ts and the
   *  schema.prisma comment on NewsArticle.schemaType. NewsArticle-level,
   *  not per-locale — every language tab shares one value. */
  schemaType: string;
  /** NewsArticle-level canonical-URL override — see the schema.prisma
   *  comment on NewsArticle.canonicalUrl. */
  canonicalUrl: string;
  /** Comma-separated, same convention as `tags` — NewsArticle-level. */
  secondaryKeywords: string;
};

/** Where §7.2's focus mode is remembered. One key for the whole editor,
 *  not one per article: it is how this person likes to write, not a fact
 *  about any particular draft. */
const FOCUS_MODE_KEY = "andaman.news.focusMode";

export const EMPTY_ARTICLE: NewsFormValues = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  // Every brand-new article starts in the rich-text editor — MARKDOWN is
  // only ever seen on an article old enough to predate it.
  contentFormat: "HTML",
  coverImageUrl: "",
  ogImageUrl: "",
  category: "",
  tags: "",
  metaTitle: "",
  metaDescription: "",
  focusKeyword: "",
  noIndex: false,
  isPublished: false,
  publishedAt: "",
  schemaType: "NewsArticle",
  canonicalUrl: "",
  secondaryKeywords: "",
};

type Props = {
  locale: string;
  lang: Locale;
  action: (state: NewsFormState, formData: FormData) => Promise<NewsFormState>;
  values?: NewsFormValues;
  onDelete?: () => Promise<void>;
  categories: string[];
  submitLabel: string;
  /** Whether every site locale already has a title and a body — computed
   *  server-side (lib/admin/news-list.ts's completeness logic is
   *  "server-only") and handed in as a plain boolean for the SEO
   *  checklist's languageComplete row. */
  languageComplete: boolean;
  /** Only an ADMIN sees the publish-gate override control below — see
   *  actions.ts's applySeoPublishGate(), which is the real boundary this
   *  UI is a courtesy in front of, not a replacement for. */
  role: Role;
  /** "Should link to" / inbound links / external-link status for
   *  NewsSeoPanel's Links tab — a brand-new (not yet saved) article has
   *  no id to compute this from, so the new-article page passes an empty
   *  panel rather than this being optional here. */
  linkPanel: ArticleLinkPanel;
  addLinkAction: typeof addLinkOpportunity;
  /** The page's own header now renders inside this component — the same
   *  component that owns useActionState's pending state, so the top-right
   *  workflow button can show it — rather than the edit/new pages rendering
   *  their own separate <header>. */
  headerTitle: string;
  backHref: string;
  backLabel: string;
  /** The public permalink shown next to the title once an article is
   *  actually live — null for a brand-new article, or one not live yet. */
  live?: { href: string; path: string } | null;
  /** "In review" pill shown next to the button when the viewer's own role
   *  can't perform the transition the button's label would otherwise
   *  imply (an EDITOR looking at their own IN_REVIEW submission) — see
   *  actions.ts's updateArticleAndTransition for why the button itself
   *  still always saves regardless. */
  statusPillLabel?: string | null;
};

const INITIAL: NewsFormState = { ok: false };

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="admin-label">
        {label}
      </label>
      {children}
      {hint && !error && <p className="admin-hint">{hint}</p>}
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/** `pending` is passed in from useActionState's own third tuple element
 *  rather than read via useFormStatus() — that hook only works for a
 *  descendant of the <form> in the React tree, and the header's copy of
 *  this button (associated with the form purely via the `form` HTML
 *  attribute, so it can sit above the form visually) is not one. Reusing
 *  one component for both means they can never show out-of-sync pending
 *  states. */
function SubmitButton({ label, pending, form }: { label: string; pending: boolean; form?: string }) {
  const t = useTranslations("admin.common");

  return (
    <button type="submit" form={form} disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function DeleteButton({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmLabel)) event.preventDefault();
      }}
      className="admin-btn-danger"
    >
      <Trash2 size={15} aria-hidden />
      {label}
    </button>
  );
}

/** Markdown body with a live length readout and the formatting toolbar.
 *  Controlled from NewsForm, not self-owned — NewsSeoPanel needs to see
 *  every keystroke here too. */
function BodyField({
  name,
  label,
  value,
  onChange,
  error,
  minutesLabel,
  textareaRef,
  toolbar,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  minutesLabel: (minutes: number) => string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  toolbar: React.ReactNode;
}) {
  const minutes = readingMinutes(value);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={name} className="admin-label mb-0">
          {label}
        </label>
        <span className="text-xs tabular-nums text-ink-muted">
          {value.length.toLocaleString()} · {minutesLabel(minutes)}
        </span>
      </div>

      <div className="mb-2">{toolbar}</div>

      <textarea
        ref={textareaRef}
        id={name}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={16}
        required
        className="admin-textarea font-mono text-xs leading-relaxed"
      />

      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export default function NewsForm({
  locale,
  lang,
  action,
  values = EMPTY_ARTICLE,
  onDelete,
  categories,
  submitLabel,
  languageComplete,
  role,
  linkPanel,
  addLinkAction,
  headerTitle,
  backHref,
  backLabel,
  live,
  statusPillLabel,
}: Props) {
  const t = useTranslations("admin");
  const tUpload = useTranslations("admin.upload");
  const [state, formAction, isPending] = useActionState(action, INITIAL);

  const err = (name: string) => {
    const code = state.fields?.[name];
    if (!code) return null;
    return code === "SLUG_TAKEN" ? t("news.slugTaken") : code;
  };

  const minutesLabel = (minutes: number) => t("news.readingTime", { minutes });


  // Mirrored so NewsSeoPanel can recompute its score/checklist/density on
  // every keystroke — see the file header for why excerpt is not among
  // these.
  const [title, setTitle] = useState(values.title);
  const [slug, setSlug] = useState(values.slug);
  const [metaTitle, setMetaTitle] = useState(values.metaTitle);
  const [metaDescription, setMetaDescription] = useState(values.metaDescription);
  const [focusKeyword, setFocusKeyword] = useState(values.focusKeyword);
  const [content, setContent] = useState(values.content);
  const [coverImageUrl, setCoverImageUrl] = useState(values.coverImageUrl);
  const [ogImageUrl, setOgImageUrl] = useState(values.ogImageUrl);
  const [schemaType, setSchemaType] = useState(values.schemaType);
  const [canonicalUrl, setCanonicalUrl] = useState(values.canonicalUrl);
  const [secondaryKeywords, setSecondaryKeywords] = useState(values.secondaryKeywords);
  // Fed by NewsSeoPanel on its own 300ms debounce — see that file. Drives
  // the publish-gate UI below; the real enforcement is server-side in
  // actions.ts's applySeoPublishGate() regardless of what this shows.
  const [seoResult, setSeoResult] = useState<SeoScoreResult | null>(null);

  // Flips from MARKDOWN to HTML only via the explicit convert button below
  // — never automatically. See the file header for the title↔H1 sync this
  // unlocks once it's HTML.
  const [contentFormat, setContentFormat] = useState<ContentFormat>(values.contentFormat);

  /*
    §7.2's focus mode. Remembered in localStorage rather than in the URL or
    on the server: it is a preference about this browser window, not about
    the article, and an editor who works in it wants it on again tomorrow.

    Read in an effect rather than in useState's initializer, because the
    server renders this component too and localStorage does not exist
    there — reading it during render makes the first client render disagree
    with the server's and React replaces the whole tree.
  */
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    try {
      setFocusMode(window.localStorage.getItem(FOCUS_MODE_KEY) === "1");
    } catch {
      // Private mode, or storage disabled. The default is off, which is
      // what it already is.
    }
  }, []);

  function toggleFocusMode() {
    setFocusMode((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(FOCUS_MODE_KEY, next ? "1" : "0");
      } catch {
        // Not being able to remember it is not a reason not to do it.
      }
      return next;
    });
  }

  /* §7.3's counter. Recomputed on every keystroke rather than debounced
     like NewsSeoPanel's panel-wide recompute: this is one cheap pass over
     the body, and a word count that lags a third of a second behind the
     words reads as broken. */
  const richTextStats = useMemo(
    () => getContentStats(content, contentFormat),
    [content, contentFormat],
  );

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const richTextEditorRef = useRef<RichTextEditorHandle>(null);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalAnchorText, setLinkModalAnchorText] = useState("");
  /** Set when the editor's link bubble menu asked to edit an existing
   *  link rather than insert a new one — the same modal, prefilled. */
  const [linkModalInitial, setLinkModalInitial] =
    useState<{ href: string; newTab: boolean; nofollow: boolean } | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  /** Upload trouble from a drag/paste into the body — shown once and
   *  dismissed, rather than a field-level error on a field that has none. */
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  function handleTitleChange(next: string) {
    setTitle(next);
    // No-op unless the body's first node is already an H1 — see
    // RichTextEditor.tsx's setFirstHeadingText and the file header.
    richTextEditorRef.current?.setFirstHeadingText(next);
  }

  function convertToRichText() {
    // marked, not lib/markdown.ts's renderMarkdown: that file is
    // "server-only" (it wraps isomorphic-dompurify's real sanitize pass)
    // and cannot be imported into this client component. The HTML this
    // produces is not sanitized before it loads into TipTap — deliberately:
    // it is this same admin's own already-published Markdown, not
    // attacker-supplied input, and createArticle/updateArticle run it
    // through sanitizeArticleHtml() before anything reaches the database
    // or a visitor regardless. That server-side pass is the actual
    // security boundary; this step only has to produce something TipTap
    // can load.
    const html = marked.parse(content, { async: false }) as string;
    setContent(html);
    setContentFormat("HTML");
  }

  function openLinkModal() {
    setLinkModalAnchorText(richTextEditorRef.current?.getSelectedText() ?? "");
    setLinkModalInitial(null);
    setLinkModalOpen(true);
  }

  /** The editor has already selected the whole link by the time this runs,
   *  so the modal's result replaces it rather than nesting inside it. */
  function openLinkModalForEdit(current: { href: string; newTab: boolean; nofollow: boolean }) {
    setLinkModalAnchorText(richTextEditorRef.current?.getSelectedText() ?? "");
    setLinkModalInitial(current);
    setLinkModalOpen(true);
  }

  function handleInsertLink(link: InsertedLink) {
    richTextEditorRef.current?.insertLink(link);
  }

  function handleInsertImage(image: InsertedImage) {
    richTextEditorRef.current?.insertImage(image);
  }

  const transitionFailedReason = state.message?.startsWith("TRANSITION_FAILED:")
    ? state.message.slice("TRANSITION_FAILED:".length)
    : null;

  return (
    <>
      <header>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary">
          <ArrowLeft size={14} aria-hidden />
          {backLabel}
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-primary sm:text-3xl">{headerTitle}</h1>
            {live && (
              <Link
                href={live.href}
                target="_blank"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
              >
                <ExternalLink size={14} aria-hidden />
                {live.path}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {statusPillLabel && (
              <span className="rounded-xs bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                {statusPillLabel}
              </span>
            )}
            {/* §7.2. In the header rather than beside the body field,
                because what it changes is the whole page's layout and not
                anything about the article. */}
            <button
              type="button"
              onClick={toggleFocusMode}
              aria-pressed={focusMode}
              title={focusMode ? t("news.focusMode.exit") : t("news.focusMode.enter")}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xs border transition-colors ${
                focusMode
                  ? "border-primary/40 bg-primary/5 text-primary"
                  : "border-primary/15 text-ink-muted hover:border-primary/30 hover:text-primary"
              }`}
            >
              {focusMode ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
              <span className="sr-only">
                {focusMode ? t("news.focusMode.exit") : t("news.focusMode.enter")}
              </span>
            </button>
            <SubmitButton label={submitLabel} pending={isPending} form="news-form" />
          </div>
        </div>
      </header>

      <form id="news-form" action={formAction} className="space-y-8">
        <input type="hidden" name="locale" value={lang} />
        <input type="hidden" name="contentFormat" value={contentFormat} />
        <input type="hidden" name="schemaType" value={schemaType} />
        <input type="hidden" name="canonicalUrl" value={canonicalUrl} />
        <input type="hidden" name="secondaryKeywords" value={secondaryKeywords} />

        {state.ok && state.message === "SAVED" && !transitionFailedReason && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={16} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}

        {state.ok && transitionFailedReason && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={16} aria-hidden />
            {t("news.workflow.transitionFailed")}
          </SaveToast>
        )}

        {!state.ok && state.message === "SAVE_FAILED" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={16} aria-hidden />
            {t("common.error")}
          </SaveToast>
        )}

        <div
          className={`grid gap-6 ${
            focusMode ? "lg:grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_320px]"
          }`}
        >
          <div className="space-y-8">
            {/* ── Identity ────────────────────────────────────────────── */}
            <section className="admin-card space-y-5">
              <Field
                name="title"
                error={err("title")}
                label={`${t("news.articleTitle")} · ${lang.toUpperCase()}`}
              >
                <input
                  id="title"
                  name="title"
                  value={title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  required
                  className="admin-input"
                />
              </Field>

              <Field
                name="slug"
                error={err("slug")}
                label={t("news.slug")}
                hint={t("news.slugHint")}
              >
                <SlugField
                  id="slug"
                  defaultValue={values.slug}
                  onChange={setSlug}
                  required
                  className="admin-input font-mono"
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  name="category"
                  error={err("category")}
                  label={t("news.category")}
                  hint={t("news.categoryHint")}
                >
                  <input
                    id="category"
                    name="category"
                    defaultValue={values.category}
                    list="news-categories"
                    className="admin-input"
                  />
                  {/* Existing categories as suggestions — free text still allowed,
                      but this stops "Market Insight" and "Market insights" both
                      becoming filter chips. */}
                  <datalist id="news-categories">
                    {categories.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </Field>

                <Field
                  name="tags"
                  error={err("tags")}
                  label={t("news.tags")}
                  hint={t("news.tagsHint")}
                >
                  <input
                    id="tags"
                    name="tags"
                    defaultValue={values.tags}
                    className="admin-input"
                  />
                </Field>
              </div>

              <ImageUploader
                name="coverImageUrl"
                prefix="news"
                slug={slug}
                defaultValue={values.coverImageUrl}
                onChange={setCoverImageUrl}
                label={t("news.coverImage")}
              />
            </section>

            {/* ── Excerpt ─────────────────────────────────────────────── */}
            <section className="admin-card space-y-5">
              <h2 className="admin-section-title">{t("news.excerpt")}</h2>
              <p className="admin-hint -mt-3">{t("news.excerptHint")}</p>

              <Field name="excerpt" error={err("excerpt")} label={lang.toUpperCase()}>
                <textarea
                  id="excerpt"
                  name="excerpt"
                  defaultValue={values.excerpt}
                  rows={3}
                  className="admin-textarea"
                />
              </Field>
            </section>

            {/* ── Body ────────────────────────────────────────────────── */}
            <section className="admin-card space-y-6">
              <div>
                <h2 className="admin-section-title">{t("news.body")}</h2>
                <p className="admin-hint">
                  {contentFormat === "HTML" ? t("news.bodyHintRichText") : t("news.bodyHint")}
                </p>
              </div>

              {contentFormat === "MARKDOWN" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xs border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-ink">
                  <span>{t("news.convertBanner.text")}</span>
                  <button type="button" onClick={convertToRichText} className="admin-btn-ghost shrink-0 text-xs">
                    {t("news.convertBanner.button")}
                  </button>
                </div>
              )}

              {contentFormat === "MARKDOWN" ? (
                <BodyField
                  name="content"
                  label={lang.toUpperCase()}
                  value={content}
                  onChange={setContent}
                  error={err("content")}
                  minutesLabel={minutesLabel}
                  textareaRef={bodyRef}
                  toolbar={
                    <MarkdownToolbar
                      textareaRef={bodyRef}
                      value={content}
                      onChange={setContent}
                      labels={{
                        toolbar: t("news.toolbar.toolbar"),
                        heading2: t("news.toolbar.heading2"),
                        heading3: t("news.toolbar.heading3"),
                        bold: t("news.toolbar.bold"),
                        italic: t("news.toolbar.italic"),
                        bulletList: t("news.toolbar.bulletList"),
                        quote: t("news.toolbar.quote"),
                        link: t("news.toolbar.link"),
                      }}
                    />
                  }
                />
              ) : (
                <div>
                  {/* §7.3: the Markdown field has carried a count beside its
                      label since it existed; rich text had none, so the only
                      way to see how long a draft was running was to glance at
                      the SEO panel. Same getContentStats() the panel calls —
                      Thai word counting has its own rules in there and a
                      second implementation would disagree with the one the
                      publish gate reads. */}
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <label htmlFor="rich-text-body" className="admin-label mb-0">
                      {lang.toUpperCase()}
                    </label>
                    <span className="text-xs tabular-nums text-ink-muted">
                      {t("news.seo.statsWordsCount", { count: richTextStats.wordCount })} ·{" "}
                      {minutesLabel(richTextStats.readingMinutes)}
                    </span>
                  </div>
                  <input type="hidden" name="content" value={content} />
                  <RichTextEditor
                    ref={richTextEditorRef}
                    content={content}
                    onChange={setContent}
                    onFirstH1TextChange={(text) => {
                      if (text !== null) setTitle(text);
                    }}
                    placeholder={t("news.bodyPlaceholder")}
                    locale={lang}
                    figureLabels={{
                      alignLeft: t("news.figure.alignLeft"),
                      alignCenter: t("news.figure.alignCenter"),
                      alignRight: t("news.figure.alignRight"),
                      alignNone: t("news.figure.alignNone"),
                      widthNormal: t("news.figure.widthNormal"),
                      widthWide: t("news.figure.widthWide"),
                      widthFull: t("news.figure.widthFull"),
                      editAlt: t("news.figure.editAlt"),
                      altLabel: t("news.figure.altLabel"),
                      altMissing: t("news.figure.altMissing"),
                      altDone: t("news.figure.altDone"),
                      remove: t("news.figure.remove"),
                    }}
                    onRequestLink={openLinkModal}
                    onRequestEditLink={openLinkModalForEdit}
                    onUploadNotice={setUploadNotice}
                    uploadLabels={{
                      failed: tUpload("failed"),
                      tooLarge: tUpload("tooLarge"),
                      pastedImage: tUpload("pastedImage"),
                      byKey: (key) => tUpload(key as never),
                    }}
                    onRequestImage={() => setImageModalOpen(true)}
                    toolbarLabels={{
                      paragraph: t("news.richToolbar.paragraph"),
                      heading: (level) => t("news.richToolbar.heading", { level }),
                      bold: t("news.richToolbar.bold"),
                      italic: t("news.richToolbar.italic"),
                      strike: t("news.richToolbar.strike"),
                      code: t("news.richToolbar.code"),
                      codeBlock: t("news.richToolbar.codeBlock"),
                      horizontalRule: t("news.richToolbar.horizontalRule"),
                      bulletList: t("news.richToolbar.bulletList"),
                      orderedList: t("news.richToolbar.orderedList"),
                      quote: t("news.richToolbar.quote"),
                      link: t("news.richToolbar.link"),
                      image: t("news.richToolbar.image"),
                      faq: t("news.richToolbar.faq"),
                      callout: t("news.richToolbar.callout"),
                      calloutTone: (tone) => t(`news.richToolbar.calloutTones.${tone}` as never),
                      pullQuote: t("news.richToolbar.pullQuote"),
                      cta: t("news.richToolbar.cta"),
                      projectCard: t("news.richToolbar.projectCard"),
                      dragHandle: t("news.richToolbar.dragHandle"),
                      slashEmpty: t("news.richToolbar.slashEmpty"),
                      slashKeywords: (id) => t(`news.richToolbar.slashKeywords.${id}` as never),
                      table: t("news.richToolbar.table"),
                      tableAddRow: t("news.richToolbar.tableAddRow"),
                      tableDeleteRow: t("news.richToolbar.tableDeleteRow"),
                      tableAddColumn: t("news.richToolbar.tableAddColumn"),
                      tableDeleteColumn: t("news.richToolbar.tableDeleteColumn"),
                      tableHeaderRow: t("news.richToolbar.tableHeaderRow"),
                      tableDelete: t("news.richToolbar.tableDelete"),
                      textStyle: t("news.richToolbar.textStyle"),
                      undo: t("news.richToolbar.undo"),
                      redo: t("news.richToolbar.redo"),
                      clearFormat: t("news.richToolbar.clearFormat"),
                      editLink: t("news.richToolbar.editLink"),
                      openLink: t("news.richToolbar.openLink"),
                      removeLink: t("news.richToolbar.removeLink"),
                    }}
                  />
                  {uploadNotice && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                      <span className="flex-1">{uploadNotice}</span>
                      <button
                        type="button"
                        onClick={() => setUploadNotice(null)}
                        className="shrink-0 font-medium underline"
                      >
                        {tUpload("dismiss")}
                      </button>
                    </p>
                  )}
                  {err("content") && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
                      <AlertCircle size={13} aria-hidden />
                      {err("content")}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Publication ─────────────────────────────────────────── */}
            <section className="admin-card space-y-5">
              {(() => {
                // Only a fresh publish is ever gated — an article already
                // live stays live regardless of what it fails today,
                // mirroring lib/publishing-gate.ts's own "never take away
                // what's already there" rule. See actions.ts's
                // applySeoPublishGate() for the real (server-side) copy of
                // this same condition.
                const wouldBeBlocked = !values.isPublished && Boolean(seoResult?.hasBlockingFailure);
                const isAdmin = hasRole(role, Role.ADMIN);
                const failingChecks = seoResult?.checks.filter((c) => c.status === "fail") ?? [];
                // Only bodyLength's message interpolates {count} — computed
                // here, not memoized, since this block only renders at all
                // while a fresh publish is actually blocked.
                const checkArgs = (id: string) =>
                  id === "bodyLength" ? { count: getContentStats(content, contentFormat).wordCount } : undefined;

                return (
                  <>
                    <label className="flex items-start gap-3 text-sm text-ink">
                      <input
                        type="checkbox"
                        name="isPublished"
                        defaultChecked={values.isPublished}
                        disabled={wouldBeBlocked && !isAdmin}
                        className="mt-0.5 h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
                      />
                      <span>{t("news.publish")}</span>
                    </label>

                    {wouldBeBlocked && (
                      <div className="flex items-start gap-2 rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                        <div>
                          <p>{t("news.seo.publishBlockedReason", { count: failingChecks.length })}</p>
                          <ul className="mt-1 list-inside list-disc">
                            {failingChecks.map((c) => (
                              <li key={c.id}>{t(`news.seo.checks.${c.id}`, checkArgs(c.id))}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {wouldBeBlocked && isAdmin && (
                      <label className="flex items-start gap-3 text-sm text-ink">
                        <input
                          type="checkbox"
                          name="overridePublishGate"
                          className="mt-0.5 h-4 w-4 rounded-xs border-amber-400 text-amber-600 focus:ring-amber-400/40"
                        />
                        <span>
                          {t("news.seo.overridePublishLabel")}
                          <span className="mt-0.5 block text-xs text-ink-muted">
                            {t("news.seo.overridePublishHint")}
                          </span>
                        </span>
                      </label>
                    )}
                  </>
                );
              })()}

              <Field
                name="publishedAt"
                error={err("publishedAt")}
                label={t("news.publishedAt")}
                hint={t("news.publishedAtHint")}
              >
                {/* Not <input type="datetime-local">: Chromium renders that
                    picker in the browser's language and ignores the page's
                    — so an admin who set the back office to English still
                    got a Thai calendar. Same submitted value, same name. */}
                <DateTimeField
                  id="publishedAt"
                  name="publishedAt"
                  defaultValue={values.publishedAt}
                  className="max-w-xs"
                />
              </Field>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton label={submitLabel} pending={isPending} />

              <Link href={backHref} className="admin-btn-ghost">
                {t("common.cancel")}
              </Link>
            </div>
          </div>

          {/* ── SEO inspector ─────────────────────────────────────────────
              `hidden`, not unmounted, and §7.2 is explicit about why: the
              publish gate (§3.5) reads the score this panel computes and
              reports through onSeoResultChange. Unmounting it would stop
              that arriving, and the gate would quietly go back to whatever
              the last value was — or to nothing at all on a fresh load,
              which is the state that lets an article through. Focus mode
              turns off the display, not the work. */}
          <div className={focusMode ? "hidden" : undefined}>
          <NewsSeoPanel
            lang={lang}
            languageComplete={languageComplete}
            contentFormat={contentFormat}
            values={{
              title,
              metaTitle,
              metaDescription,
              slug,
              excerpt: values.excerpt,
              focusKeyword,
              content,
              coverImageUrl,
              ogImageUrl,
              schemaType,
              canonicalUrl,
              secondaryKeywords,
            }}
            onFocusKeywordChange={setFocusKeyword}
            onMetaTitleChange={setMetaTitle}
            onMetaDescriptionChange={setMetaDescription}
            onOgImageUrlChange={setOgImageUrl}
            onSchemaTypeChange={setSchemaType}
            onCanonicalUrlChange={setCanonicalUrl}
            onSecondaryKeywordsChange={setSecondaryKeywords}
            onSeoResultChange={setSeoResult}
            metaTitleError={err("metaTitle")}
            metaDescriptionError={err("metaDescription")}
            focusKeywordError={err("focusKeyword")}
            noIndexDefaultChecked={values.noIndex}
            role={role}
            uiLocale={locale}
            linkPanel={linkPanel}
            addLinkAction={addLinkAction}
            /* Only in rich-text mode: a MARKDOWN article is a textarea, and
               there is no caret for the outline to move. */
            onSelectHeading={
              contentFormat === "HTML"
                ? (index) => richTextEditorRef.current?.focusHeading(index)
                : undefined
            }
            onMoveSection={
              contentFormat === "HTML"
                ? (from, to) => richTextEditorRef.current?.moveSection(from, to)
                : undefined
            }
          />
          </div>
        </div>
      </form>

      {contentFormat === "HTML" && (
        <>
          <InternalLinkModal
            open={linkModalOpen}
            onClose={() => setLinkModalOpen(false)}
            locale={lang}
            initialAnchorText={linkModalAnchorText}
            initialLink={linkModalInitial}
            onInsert={handleInsertLink}
          />
          <InsertImageModal
            open={imageModalOpen}
            onClose={() => setImageModalOpen(false)}
            locale={lang}
            onInsert={handleInsertImage}
          />
        </>
      )}

      {onDelete && (
        <form action={onDelete} className="mt-10 border-t border-primary/10 pt-6">
          <DeleteButton
            label={t("common.delete")}
            confirmLabel={t("common.confirmDelete")}
          />
        </form>
      )}
    </>
  );
}
