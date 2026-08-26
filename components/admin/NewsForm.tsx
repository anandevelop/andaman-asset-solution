"use client";

/**
 * components/admin/NewsForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Article editor. Body fields are plain Markdown textareas with a live
 * character/reading-time readout — no WYSIWYG. A rich-text editor that
 * round-trips Markdown reliably is a project of its own, and the failure
 * mode (silently mangled formatting on save) is worse than typing "##".
 *
 * title/excerpt/content/metaTitle/metaDescription are translated — see
 * NewsArticleTranslation in schema.prisma. `lang` selects which locale
 * this instance shows/saves; the edit page owns the language selector —
 * see AwardForm's file comment for the fuller version of this note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { NewsFormState } from "@/app/[locale]/admin/news/actions";

export type NewsFormValues = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  category: string;
  tags: string;
  metaTitle: string;
  metaDescription: string;
  isPublished: boolean;
  /** "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
  publishedAt: string;
};

export const EMPTY_ARTICLE: NewsFormValues = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  coverImageUrl: "",
  category: "",
  tags: "",
  metaTitle: "",
  metaDescription: "",
  isPublished: false,
  publishedAt: "",
};

type Props = {
  locale: string;
  lang: Locale;
  action: (state: NewsFormState, formData: FormData) => Promise<NewsFormState>;
  values?: NewsFormValues;
  onDelete?: () => Promise<void>;
  categories: string[];
  submitLabel: string;
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

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
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

/** Markdown body with a live length readout. */
function BodyField({
  name,
  label,
  defaultValue,
  error,
  minutesLabel,
}: {
  name: string;
  label: string;
  defaultValue: string;
  error?: string | null;
  minutesLabel: (minutes: number) => string;
}) {
  const [value, setValue] = useState(defaultValue);
  // Mirrors readingMinutes() in lib/markdown — character-based, because
  // Thai has no inter-word spaces to count.
  const minutes = value.trim() ? Math.max(1, Math.round(value.length / 1000)) : 0;

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

      <textarea
        id={name}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useFormState(action, INITIAL);

  const err = (name: string) => {
    const code = state.fields?.[name];
    if (!code) return null;
    return code === "SLUG_TAKEN" ? t("news.slugTaken") : code;
  };

  const minutesLabel = (minutes: number) => t("news.readingTime", { minutes });

  return (
    <>
      <form action={formAction} className="space-y-8">
        <input type="hidden" name="locale" value={lang} />

        {state.ok && state.message === "SAVED" && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={16} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}

        {!state.ok && state.message === "SAVE_FAILED" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={16} aria-hidden />
            {t("common.error")}
          </SaveToast>
        )}

        {/* ── Identity ──────────────────────────────────────────────── */}
        <section className="admin-card space-y-5">
          <Field
            name="title"
            error={err("title")}
            label={`${t("news.articleTitle")} · ${lang.toUpperCase()}`}
          >
            <input
              id="title"
              name="title"
              defaultValue={values.title}
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
            <input
              id="slug"
              name="slug"
              defaultValue={values.slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
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
            slug={values.slug}
            defaultValue={values.coverImageUrl}
            label={t("news.coverImage")}
          />
        </section>

        {/* ── Excerpt ───────────────────────────────────────────────── */}
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

        {/* ── Body ──────────────────────────────────────────────────── */}
        <section className="admin-card space-y-6">
          <div>
            <h2 className="admin-section-title">{t("news.body")}</h2>
            <p className="admin-hint">{t("news.bodyHint")}</p>
          </div>

          <BodyField
            name="content"
            label={lang.toUpperCase()}
            defaultValue={values.content}
            error={err("content")}
            minutesLabel={minutesLabel}
          />
        </section>

        {/* ── SEO ───────────────────────────────────────────────────── */}
        <section className="admin-card space-y-5">
          <h2 className="admin-section-title">{t("projects.seo")}</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              name="metaTitle"
              error={err("metaTitle")}
              label={`${t("projects.metaTitle")} · ${lang.toUpperCase()}`}
            >
              <input
                id="metaTitle"
                name="metaTitle"
                defaultValue={values.metaTitle}
                className="admin-input"
              />
            </Field>

            <Field
              name="metaDescription"
              error={err("metaDescription")}
              label={`${t("projects.metaDescription")} · ${lang.toUpperCase()}`}
            >
              <textarea
                id="metaDescription"
                name="metaDescription"
                defaultValue={values.metaDescription}
                rows={3}
                className="admin-textarea"
              />
            </Field>
          </div>
        </section>

        {/* ── Publication ───────────────────────────────────────────── */}
        <section className="admin-card space-y-5">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={values.isPublished}
              className="mt-0.5 h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
            />
            <span>{t("news.publish")}</span>
          </label>

          <Field
            name="publishedAt"
            error={err("publishedAt")}
            label={t("news.publishedAt")}
            hint={t("news.publishedAtHint")}
          >
            <input
              id="publishedAt"
              name="publishedAt"
              type="datetime-local"
              defaultValue={values.publishedAt}
              className="admin-input max-w-xs"
            />
          </Field>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={submitLabel} />

          <Link href={`/${locale}/admin/news`} className="admin-btn-ghost">
            {t("common.cancel")}
          </Link>
        </div>
      </form>

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
