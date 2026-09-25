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
 * The length meter and the result card are seo/SeoLengthMeter.tsx and
 * seo/SerpPreview.tsx, shared with PageSeoEditor — which used to draw both
 * itself, to different rules: its counter knew SEO_LIMITS' maximum and not
 * its minimum, so a 23-character title was fine on the project SEO tab and
 * flagged as too short here. See those two files for the full note.
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
import { SEO_LIMITS } from "@/lib/seo-limits";
import SeoLengthMeter from "@/components/admin/seo/SeoLengthMeter";
import SerpPreview from "@/components/admin/seo/SerpPreview";

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
          <SeoLengthMeter
            length={title.length}
            min={SEO_LIMITS.titleMin}
            max={SEO_LIMITS.title}
            hint={titleLengthHint}
          />
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
          <SeoLengthMeter
            length={description.length}
            min={SEO_LIMITS.descriptionMin}
            max={SEO_LIMITS.description}
            hint={descriptionLengthHint}
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

        <SerpPreview
          className="mt-3 max-w-xl rounded-xs bg-white p-4"
          displayPath={displayPath}
          title={title.trim() || fallbackTitle}
          description={description.trim() || fallbackDescription}
          keyword={focusKeyword}
        />

        <p className="mt-3 text-xs text-ink-muted">{previewHint}</p>
      </div>
    </div>
  );
}
