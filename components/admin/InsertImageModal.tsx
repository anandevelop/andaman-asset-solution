"use client";

/**
 * components/admin/InsertImageModal.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The rich-text editor's "insert image" tool — wraps
 * components/admin/MediaLibrary.tsx in its picker mode rather than
 * building a second uploader, per this feature's own requirement.
 *
 * Two steps: pick a file from the library (or upload a new one, via
 * MediaLibrary's own existing upload button), then fill in what the
 * editor's figure node needs that the library doesn't already track —
 * caption, alignment, loading — plus alt text, which the library *does*
 * track (Media.altText[locale]) and this modal both reads as a default
 * and writes back to, through the same updateMediaMeta() MediaDetail's
 * own alt-text save already uses. Alt is required: the insert button
 * stays disabled until it's filled in, since an image with no alt text
 * is exactly the gap /admin/media's own missing-alt filter exists to
 * surface — this modal shouldn't be a way to create more of it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import AdminModal from "@/components/admin/AdminModal";
import MediaLibraryPicker, { type MediaItem } from "@/components/admin/MediaLibraryPicker";
import { updateMediaMeta } from "@/app/[locale]/admin/(content)/media/actions";
import type { InsertedImage } from "@/components/admin/RichTextEditor";
import type { Locale } from "@/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  onInsert: (image: InsertedImage) => void;
};

type Step = "pick" | "details";
type Align = "left" | "center" | "right" | null;

export default function InsertImageModal({ open, onClose, locale, onInsert }: Props) {
  const t = useTranslations("admin.news.imageModal");
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [align, setAlign] = useState<Align>(null);
  const [loading, setLoading] = useState<"lazy" | "eager">("lazy");
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setSelected(null);
    setAlt("");
    setCaption("");
    setAlign(null);
    setLoading("lazy");
  }, [open]);

  function handleSelect(item: MediaItem) {
    setSelected(item);
    setAlt(item.altText[locale] ?? "");
    setStep("details");
  }

  function handleInsert() {
    const altText = alt.trim();
    if (!selected || !altText) return;

    // Written back only when it actually changed — same guard MediaDetail
    // itself doesn't need, since a genuinely unedited value round-tripping
    // through updateMediaMeta is harmless but pointless.
    if ((selected.altText[locale] ?? "") !== altText) {
      startSaving(async () => {
        await updateMediaMeta(locale, {
          id: selected.id,
          altText: { ...selected.altText, [locale]: altText },
          tags: selected.tags,
        });
      });
    }

    onInsert({
      src: selected.url,
      alt: altText,
      caption: caption.trim(),
      align,
      loading,
      mediaId: selected.id,
    });
    onClose();
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      titleId="insert-image-modal-title"
      title={t("title")}
      closeLabel={t("close")}
      className="max-w-4xl"
    >
      {step === "pick" ? (
        <MediaLibraryPicker open={open} locale={locale} loadingLabel={t("loading")} onSelect={handleSelect} />
      ) : selected ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setStep("pick")}
            className="text-xs font-medium text-accent-700 hover:underline"
          >
            ← {t("backToLibrary")}
          </button>

          <div className="flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.url} alt="" className="h-28 w-40 shrink-0 rounded-xs object-cover" />
            <div className="flex-1">
              <label className="admin-label" htmlFor="image-alt">
                {t("altLabel")} <span className="text-red-600">*</span>
              </label>
              <input
                id="image-alt"
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                required
                className="admin-input"
              />
              <p className="admin-hint">{t("altHint")}</p>
            </div>
          </div>

          <div>
            <label className="admin-label" htmlFor="image-caption">
              {t("captionLabel")}
            </label>
            <input
              id="image-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className="admin-input"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="admin-label" htmlFor="image-align">
                {t("alignLabel")}
              </label>
              <select
                id="image-align"
                value={align ?? ""}
                onChange={(event) => setAlign((event.target.value || null) as Align)}
                className="admin-input"
              >
                <option value="">{t("align.none")}</option>
                <option value="left">{t("align.left")}</option>
                <option value="center">{t("align.center")}</option>
                <option value="right">{t("align.right")}</option>
              </select>
            </div>
            <div>
              <label className="admin-label" htmlFor="image-loading">
                {t("loadingLabel")}
              </label>
              <select
                id="image-loading"
                value={loading}
                onChange={(event) => setLoading(event.target.value as "lazy" | "eager")}
                className="admin-input"
              >
                <option value="lazy">{t("loadingLazy")}</option>
                <option value="eager">{t("loadingEager")}</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-primary/10 pt-4">
            <button type="button" onClick={onClose} className="admin-btn-ghost">
              {t("cancel")}
            </button>
            <button type="button" onClick={handleInsert} disabled={!alt.trim() || saving} className="admin-btn">
              {t("insert")}
            </button>
          </div>
        </div>
      ) : null}
    </AdminModal>
  );
}
