"use client";

/**
 * components/admin/ArticlePreview.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ดูตัวอย่าง" in the article editor: the article as a reader will see it,
 * from what is typed now — saved or not, published or not.
 *
 * The body comes back from previewArticleBody, which runs the public
 * page's own render pipeline, and is drawn inside `.prose-article`, the
 * public page's class — so headings, lists, quotes and figures look as
 * they will live. The live page itself is not usable for this: a draft
 * is a 404 there, and a published article shows its saved text, not the
 * edit in progress.
 *
 * A wide panel rather than a new tab, so the editor (and its unsaved
 * state) stays exactly where it was; Escape or the backdrop closes it.
 * Desktop or phone width, since most readers arrive on a phone.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Monitor, Smartphone, X } from "lucide-react";
import { previewArticleBody } from "@/app/[locale]/admin/(content)/news/actions";
import Segmented from "@/components/admin/ui/Segmented";

export default function ArticlePreview({
  title,
  excerpt,
  coverImageUrl,
  content,
  format,
  path,
  onClose,
  labels,
}: {
  title: string;
  excerpt: string;
  coverImageUrl: string;
  content: string;
  format: "HTML" | "MARKDOWN";
  /** "/th/news/slug" — shown as the page's address, not a link. */
  path: string;
  onClose: () => void;
  labels: { title: string; close: string; device: string; desktop: string; phone: string; failed: string; untitled: string };
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  useEffect(() => {
    let live = true;
    previewArticleBody(content, format)
      .then((result) => {
        if (!live) return;
        if (result.ok) setHtml(result.html);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [content, format]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] print:hidden" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label={labels.close}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-adm-band/50 motion-safe:animate-[lead-drawer-fade_150ms_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        className="absolute inset-2.5 mx-auto flex max-w-[1100px] flex-col overflow-hidden rounded-[20px] bg-adm-solid shadow-[var(--adm-shadow-float)] motion-safe:animate-[lead-drawer-fade_180ms_ease-out]"
      >
        <div className="flex items-center gap-3 border-b border-adm-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-adm-text">{labels.title}</h2>
          <span className="admin-mono hidden min-w-0 flex-1 truncate text-xs text-adm-muted sm:block">{path}</span>
          <span className="flex-1 sm:hidden" />
          <Segmented
            label={labels.device}
            active={device}
            onSelect={(key) => setDevice(key as "desktop" | "phone")}
            items={[
              { key: "desktop", label: labels.desktop, icon: Monitor },
              { key: "phone", label: labels.phone, icon: Smartphone },
            ]}
          />
          <button type="button" onClick={onClose} aria-label={labels.close} className="admin-btn-quiet admin-btn-sm">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-adm-text/4 p-4">
          {/* White and the site's own text colour whatever the admin theme:
              this is the public page, which has no dark mode. */}
          <article
            className="mx-auto rounded-[12px] bg-white px-6 py-8 text-[#0d2635] shadow-sm transition-[max-width] sm:px-10"
            style={{ maxWidth: device === "phone" ? 390 : 820 }}
          >
            {coverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded cover
              <img src={coverImageUrl} alt="" className="mb-8 aspect-[16/9] w-full rounded-[8px] object-cover" />
            )}
            <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]">{title.trim() || labels.untitled}</h1>
            {excerpt.trim() && <p className="mt-3 text-base leading-relaxed text-[#4b6070]">{excerpt}</p>}
            <div className="mt-8">
              {failed ? (
                <p className="text-sm text-[#b42318]">{labels.failed}</p>
              ) : html === null ? (
                <Loader2 size={20} className="mx-auto animate-spin text-[#4b6070]" aria-hidden />
              ) : (
                <div className="prose-article" dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
