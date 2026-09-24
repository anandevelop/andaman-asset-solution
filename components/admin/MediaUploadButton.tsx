"use client";

/**
 * components/admin/MediaUploadButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Upload straight into the media library: presign → PUT to Spaces →
 * register a Media row. Deliberately a separate, slimmer component from
 * ImageUploader rather than a new mode bolted onto it — ImageUploader's
 * job is "put a URL into this one form field", with reordering and a
 * manual-URL fallback that make no sense here; this component's only job
 * is "add files to the library", many at a time, with no destination
 * field to fill in.
 *
 * Reuses admin.upload.* for the error copy — same failure modes as every
 * other uploader in this app (expired session, oversized file, blocked
 * storage), so the same messages apply.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, UploadCloud } from "lucide-react";
import {
  ACCEPT,
  uploadToLibrary,
} from "@/lib/admin/media-upload";
import type { MediaItem } from "@/components/admin/MediaLibrary";

type UploadItem = { id: string; name: string; progress: number; error?: string };

type Props = {
  locale: string;
  label: string;
  /** The just-created row, when the caller can use it directly (see
   *  MediaLibrary.tsx's picker mode) — optional so a caller that only
   *  needs a "something changed" signal can keep ignoring the argument. */
  onUploaded: (item?: MediaItem) => void;
};

export default function MediaUploadButton({ locale, label, onUploaded }: Props) {
  const t = useTranslations("admin.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);

      try {
        const result = await uploadToLibrary(locale, file, (percent) =>
          setUploads((u) => u.map((item) => (item.id === id ? { ...item, progress: percent } : item))),
        );

        if (!result.ok) {
          const message = result.messageKey
            ? t(result.messageKey as never)
            : t("failedWithReason", { reason: result.reason ?? "" });
          setUploads((u) => u.map((item) => (item.id === id ? { ...item, error: message } : item)));
          continue;
        }

        setUploads((u) => u.filter((item) => item.id !== id));
        // Assembled from what this upload already knows — createMedia only
        // echoes back the id, and a picker caller needs the full row to
        // show the new tile without a re-fetch.
        onUploaded({
          id: result.id,
          url: result.url,
          key: result.key,
          mimeType: result.mimeType,
          width: result.width,
          height: result.height,
          sizeBytes: result.sizeBytes,
          tags: [],
          altText: {},
          createdAt: new Date().toISOString(),
          uploaderName: null,
          usageCount: 0,
          isLegacyHost: false,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "";
        const message =
          reason === "BLOCKED" ? t("storageBlocked") : reason === "DENIED" ? t("storageDenied") : t("failed");
        setUploads((u) => u.map((item) => (item.id === id ? { ...item, error: message } : item)));
      }
    }
  }

  const pending = uploads.filter((u) => !u.error);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="admin-btn"
        disabled={pending.length > 0}
      >
        {pending.length > 0 ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <UploadCloud size={14} aria-hidden />
        )}
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {uploads.length > 0 && (
        <div className="w-64 space-y-1.5">
          {uploads.map((item) => (
            <div key={item.id} className="rounded-xs border border-primary/10 bg-white px-2.5 py-1.5 text-xs">
              <p className="truncate text-ink">{item.name}</p>
              {item.error ? (
                <p className="text-red-600">{item.error}</p>
              ) : (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.progress}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
