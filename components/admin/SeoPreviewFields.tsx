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
 * The 60/155 character figures are Google's rough, pixel-based truncation
 * points, not a hard limit — going over does not break anything, it just
 * means Google may cut the rest off in the result, which is why this is a
 * counter with a warning colour rather than a maxLength on the input.
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
};

const TITLE_SOFT_LIMIT = 60;
const DESCRIPTION_SOFT_LIMIT = 155;

function CharCount({ length, limit }: { length: number; limit: number }) {
  return (
    <span className={length > limit ? "text-amber-700" : "text-ink-muted"}>
      {length}/{limit}
    </span>
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
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between">
            <label className="admin-label" htmlFor="metaTitle">
              {titleLabel}
            </label>
            <CharCount length={title.length} limit={TITLE_SOFT_LIMIT} />
          </div>
          <input
            id="metaTitle"
            name="metaTitle"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="admin-input"
          />
          {titleError && <p className="mt-1.5 text-xs text-red-700">{titleError}</p>}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="admin-label" htmlFor="metaDescription">
              {descriptionLabel}
            </label>
            <CharCount length={description.length} limit={DESCRIPTION_SOFT_LIMIT} />
          </div>
          <textarea
            id="metaDescription"
            name="metaDescription"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="admin-textarea"
          />
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
