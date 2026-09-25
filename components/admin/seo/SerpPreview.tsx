"use client";

/**
 * components/admin/seo/SerpPreview.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One Google search result, as this page would appear in it.
 *
 * Drawn twice before this existed, in two different shapes:
 * SeoPreviewFields (events, news) rendered a white card with a truncated
 * blue title and a two-line description; PageSeoEditor (projects)
 * rendered a bordered row, per locale, with a "hidden from search"
 * warning. The typography, the truncation and the empty-state wording all
 * differed, so the same title looked like two different results depending
 * on which screen you were on — and the whole purpose of a preview is that
 * it looks like the real thing rather than like whoever wrote that screen.
 *
 * Kept deliberately small. It draws one result; the callers decide how
 * many and in what frame — the project editor stacks one per locale with
 * the language being edited first, which is the comparison that screen
 * exists for.
 *
 * `keyword` highlights every case-insensitive match, for the focus-keyword
 * workflow the news editor drives. Omit it and the text renders plain.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";

/** Wraps every case-insensitive match of `keyword` in `text` with <mark>.
 *  Returns `text` unchanged when `keyword` is blank or matches nothing. */
function highlight(text: string, keyword: string | undefined): ReactNode {
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

export default function SerpPreview({
  displayPath,
  title,
  description,
  keyword,
  note,
  className,
}: {
  /** e.g. "andamanassetsolution.com › news › my-article". */
  displayPath: string;
  /** Already resolved against its fallback by the caller: this component
   *  cannot know whether an empty title means "not written" or "inherits
   *  the page's own heading", and the two want different wording. */
  title: string;
  description: string;
  keyword?: string;
  /** A line under the result — the project editor uses it to say a locale
   *  is set to noIndex, which is the one fact a SERP mock cannot show by
   *  looking like a SERP. */
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="truncate text-[13px] text-ink/60">{displayPath}</p>
      <p className="mt-0.5 truncate text-lg text-[#1a0dab]">{highlight(title, keyword)}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink/70">
        {highlight(description, keyword)}
      </p>
      {note && <p className="mt-1.5 text-xs font-medium text-red-700">{note}</p>}
    </div>
  );
}
