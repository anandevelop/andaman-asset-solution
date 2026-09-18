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
import { createMedia } from "@/app/[locale]/admin/(content)/media/actions";
import type { MediaItem } from "@/components/admin/MediaLibrary";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,application/pdf,video/mp4,video/webm";
const MAX_BYTES = 100 * 1024 * 1024;

const PRESIGN_ERROR_KEYS: Record<string, string> = {
  S3_NOT_CONFIGURED: "notConfigured",
  UNSUPPORTED_TYPE: "unsupportedType",
  FILE_TOO_LARGE: "tooLarge",
  RATE_LIMITED: "rateLimited",
  UNAUTHORISED: "sessionExpired",
  TWO_FACTOR_SETUP_REQUIRED: "twoFactorRequired",
};

type UploadItem = { id: string; name: string; progress: number; error?: string };

function putToS3(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(xhr.status === 403 ? "DENIED" : `HTTP_${xhr.status}`));
    xhr.onerror = () => reject(new Error("BLOCKED"));
    xhr.onabort = () => reject(new Error("ABORTED"));
    xhr.send(file);
  });
}

/** Best-effort — a file that fails to decode (e.g. a PDF) just has no
 *  recorded dimensions, which the schema already allows for. */
function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      cleanup();
      resolve({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
    };
    img.onerror = () => {
      cleanup();
      resolve({});
    };
    img.src = url;
  });
}

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

      if (file.size > MAX_BYTES) {
        setUploads((u) => [...u, { id, name: file.name, progress: 0, error: t("tooLarge") }]);
        continue;
      }

      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);

      try {
        const response = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
            prefix: "library",
            slug: "general",
          }),
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok) {
          const code: string | undefined = result?.error;
          const key = code ? PRESIGN_ERROR_KEYS[code] : undefined;
          const message = key ? t(key as never) : t("failedWithReason", { reason: code ?? `HTTP ${response.status}` });
          setUploads((u) => u.map((item) => (item.id === id ? { ...item, error: message } : item)));
          continue;
        }

        const dims = await readImageDimensions(file);

        await putToS3(
          result.uploadUrl,
          file,
          result.headers ?? { "Content-Type": result.contentType },
          (percent) => setUploads((u) => u.map((item) => (item.id === id ? { ...item, progress: percent } : item))),
        );

        const created = await createMedia(locale, {
          url: result.publicUrl,
          key: result.key,
          mimeType: file.type,
          width: dims.width,
          height: dims.height,
          sizeBytes: file.size,
        });

        if (!created.ok || !created.id) {
          setUploads((u) => u.map((item) => (item.id === id ? { ...item, error: t("failed") } : item)));
          continue;
        }

        setUploads((u) => u.filter((item) => item.id !== id));
        // Assembled from what this upload already knows — createMedia only
        // echoes back the id, and a picker caller needs the full row to
        // show the new tile without a re-fetch.
        onUploaded({
          id: created.id,
          url: result.publicUrl,
          key: result.key ?? null,
          mimeType: file.type,
          width: dims.width ?? null,
          height: dims.height ?? null,
          sizeBytes: file.size,
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
