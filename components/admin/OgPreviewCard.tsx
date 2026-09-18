"use client";

/**
 * components/admin/OgPreviewCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A Facebook/LINE-style share-card mock, sitting beside
 * components/admin/SeoPreviewFields.tsx's Google SERP preview in the News
 * SEO panel's SEO tab. A separate file rather than another mode on that
 * component: an OG card is a different shape (image-led, no meta-title/
 * description inputs of its own) and EventForm's existing use of
 * SeoPreviewFields shouldn't have to grow a second, unrelated concern.
 *
 * Read-only — it mirrors whatever title/description/image the parent is
 * already tracking, the same way SeoPreviewFields' preview does, rather
 * than owning any state of its own.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";

type Props = {
  title: string;
  description: string;
  imageUrl: string | null;
  siteUrl: string;
  /** Highlighted the same way SeoPreviewFields does — see its header. */
  focusKeyword: string;
  label: string;
  hint: string;
};

function highlightKeyword(text: string, keyword: string): ReactNode {
  const trimmed = keyword.trim();
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

export default function OgPreviewCard({ title, description, imageUrl, siteUrl, focusKeyword, label, hint }: Props) {
  const domain = siteUrl.replace(/^https?:\/\//, "");

  return (
    <div className="rounded-xs border border-primary/10 bg-surface-muted/40 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>

      <div className="mt-3 max-w-xl overflow-hidden rounded-xs border border-primary/10 bg-white">
        <div className="relative aspect-[1200/630] w-full bg-primary/5">
          {imageUrl && (
            <ImageWithSkeleton src={imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 576px" className="object-cover" />
          )}
        </div>
        <div className="p-3">
          <p className="truncate text-[11px] uppercase tracking-wide text-ink/50">{domain}</p>
          <p className="mt-1 truncate text-sm font-semibold text-ink">{highlightKeyword(title, focusKeyword)}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink/60">
            {highlightKeyword(description, focusKeyword)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
