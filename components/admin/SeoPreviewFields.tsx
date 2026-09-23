"use client";

/**
 * components/admin/SeoPreviewFields.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The meta title/description inputs for a page's SEO section, plus a live
 * Google-search-result mock rendered from whatever is currently typed.
 *
 * Every other field in these forms is intentionally uncontrolled — see the
 * file comment on HeroStorySlideForm for why this codebase defaults to
 * that. This one field pair is controlled by exception: the whole point
 * is a preview that updates as the admin types, and there is no way to
 * read "what is currently in this textarea" without either controlling it
 * or reaching into the DOM by ref on every keystroke. Controlled state
 * changes nothing about how the value reaches the server — FormData still
 * reads these by `name` at submit time, the same as every uncontrolled
 * field beside them.
 *
 * The character figures (lib/seo-limits.ts's SEO_LIMITS — the same numbers
 * lib/article-seo.ts's News checklist and PageSeoEditor.tsx's counter
 * already score against) are Google's rough, pixel-based truncation
 * points, not a hard limit — going under wastes the snippet space Google
 * gives a result, going over risks it being cut off, which is why this is
 * a bar with a warning colour rather than a maxLength on the input.
 *
 * title/onTitleChange and description/onDescriptionChange are an optional
 * escape hatch into the state above: pass them and this component stops
 * owning its own copy, deferring to the parent's instead. NewsForm needs
 * this — its live SEO score (lib/article-seo.ts) has to see every keystroke
 * here, and there is no way to observe an uncontrolled input's value
 * without either this hook or reaching into the DOM by ref. Omit both, as
 * EventForm does, and this component behaves exactly as before.
 *
 * focusKeyword is a second, independent optional prop: when passed, every
 * case-insensitive match of it in the preview's title/description is
 * wrapped in <mark>. Omit it, as EventForm does, and the preview renders
 * the same plain text as before this existed.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { SEO_LIMITS } from "@/lib/seo-limits";

type Props = {
  titleLabel: string;
  descriptionLabel: string;
  titleError?: string | null;
  descriptionError?: string | null;
  defaultTitle: string;
  defaultDescription: string;
  fallbackTitle: string;
  fallbackDescription: string;
  /** e.g. "andaman-asset.com › news › my-article-slug" */
  displayPath: string;
  previewLabel: string;
  previewHint: string;
  /** Controlled-mode escape hatch — see the file comment. */
  title?: string;
  onTitleChange?: (value: string) => void;
  description?: string;
  onDescriptionChange?: (value: string) => void;
  /** Highlights matches in the preview below — see the file header. */
  focusKeyword?: string;
  /** "Ideal length: 30–60 characters" (or your own translated wording) —
   *  shown under the title's bar. Omit and the bar renders with no hint,
   *  as it did before this existed. */
  titleLengthHint?: string;
  /** Same, under the description's bar. */
  descriptionLengthHint?: string;
};

/** Bare count, not "{length}/{limit}" — the min–max range already sits in
 *  the hint text this renders beside, so repeating the ceiling a second
 *  time here would be the same number twice on one row. */
function CharCount({ length, limit }: { length: number; limit: number }) {
  return <span className={`font-semibold ${length > limit ? "text-amber-700" : "text-ink"}`}>{length}</span>;
}

/** In-range fills emerald; short-of-min or past-max fills amber — the same
 *  pass/fail lib/article-seo.ts's metaTitleLength/metaDescriptionLength
 *  checks already compute, so this bar never disagrees with the checklist
 *  below it. */
function CharBar({ length, min, max }: { length: number; min: number; max: number }) {
  const inRange = length >= min && length <= max;
  const fillPercent = Math.min(100, Math.round((length / max) * 100));

  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-primary/10">
      <div
        className={`h-full rounded-full transition-[width] ${inRange ? "bg-emerald-600" : "bg-amber-500"}`}
        style={{ width: `${fillPercent}%` }}
      />
    </div>
  );
}

/** Wraps every case-insensitive match of `keyword` in `text` with <mark>.
 *  Returns `text` unchanged when `keyword` is blank or matches nothing. */
function highlightKeyword(text: string, keyword: string | undefined): ReactNode {
  const trimmed = keyword?.trim();
  if (!trimmed) return text;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length === 1) return text;

  return parts.map((part, index) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark key={index} className="rounded-xs bg-accent/25 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default function SeoPreviewFields({
  titleLabel,
  descriptionLabel,
  titleError,
  descriptionError,
  defaultTitle,
  defaultDescription,
  fallbackTitle,
  fallbackDescription,
  displayPath,
  previewLabel,
  previewHint,
  title: controlledTitle,
  onTitleChange,
  description: controlledDescription,
  onDescriptionChange,
  focusKeyword,
  titleLengthHint,
  descriptionLengthHint,
}: Props) {
  const [internalTitle, setInternalTitle] = useState(defaultTitle);
  const [internalDescription, setInternalDescription] = useState(defaultDescription);

  const title = controlledTitle ?? internalTitle;
  const description = controlledDescription ?? internalDescription;

  const setTitle = (value: string) => {
    setInternalTitle(value);
    onTitleChange?.(value);
  };

  const setDescription = (value: string) => {
    setInternalDescription(value);
    onDescriptionChange?.(value);
  };

  return (
    <div className="space-y-5">
      {/* Stacked full-width, not a side-by-side grid — a fixed sm: split
          only knows the viewport is wide, not that this component itself
          might be rendered in a narrow column (the news editor's sticky
          side panel, in particular): both fields end up too narrow to fit
          their own label and count on one line, wrapping onto each other. */}
      <div className="space-y-5">
        <div>
          <label className="admin-label" htmlFor="metaTitle">
            {titleLabel}
          </label>
          <input
            id="metaTitle"
            name="metaTitle"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="admin-input"
          />
          <CharBar length={title.length} min={SEO_LIMITS.titleMin} max={SEO_LIMITS.title} />
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <p className="text-xs leading-relaxed text-ink-muted">{titleLengthHint}</p>
            <CharCount length={title.length} limit={SEO_LIMITS.title} />
          </div>
          {titleError && <p className="mt-1.5 text-xs text-red-700">{titleError}</p>}
        </div>

        <div>
          <label className="admin-label" htmlFor="metaDescription">
            {descriptionLabel}
          </label>
          <textarea
            id="metaDescription"
            name="metaDescription"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="admin-textarea"
          />
          <CharBar length={description.length} min={SEO_LIMITS.descriptionMin} max={SEO_LIMITS.description} />
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <p className="text-xs leading-relaxed text-ink-muted">{descriptionLengthHint}</p>
            <CharCount length={description.length} limit={SEO_LIMITS.description} />
          </div>
          {descriptionError && (
            <p className="mt-1.5 text-xs text-red-700">{descriptionError}</p>
          )}
        </div>
      </div>

      <div className="rounded-xs border border-primary/10 bg-surface-muted/40 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {previewLabel}
        </p>

        <div className="mt-3 max-w-xl rounded-xs bg-white p-4">
          <p className="truncate text-[13px] text-ink/60">{displayPath}</p>
          <p className="mt-0.5 truncate text-lg text-[#1a0dab]">
            {highlightKeyword(title.trim() || fallbackTitle, focusKeyword)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink/70">
            {highlightKeyword(description.trim() || fallbackDescription, focusKeyword)}
          </p>
        </div>

        <p className="mt-3 text-xs text-ink-muted">{previewHint}</p>
      </div>
    </div>
  );
}
