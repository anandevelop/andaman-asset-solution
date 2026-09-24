/**
 * lib/admin/media-upload.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The one upload path into the media library: presign → PUT to Spaces →
 * createMedia().
 *
 * It lives here rather than inside components/admin/MediaUploadButton.tsx,
 * which is where it grew, because a second caller arrived — dropping or
 * pasting an image straight into the article editor — and a second copy of
 * this flow is how the two drift: a limit raised in one place and not the
 * other, an error code mapped to a message here and to a blank there. The
 * rules an upload has to obey (what types, how large, what each presign
 * failure means to a human) belong to the upload, not to whichever button
 * happened to start it.
 *
 * Not "server-only": both callers are client components, and the actual
 * authority is the presign route, which is session-gated and rate-limited
 * per user. Nothing here is a security boundary — it is the client half of
 * a conversation the server is already policing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createMedia } from "@/app/[locale]/admin/(content)/media/actions";

/** The accept list the file picker offers and every caller must honour. */
export const ACCEPT =
  "image/jpeg,image/png,image/webp,image/avif,application/pdf,video/mp4,video/webm";

export const MAX_BYTES = 100 * 1024 * 1024;

/** Only the subset an article body can hold — the editor takes images, not
 *  the PDFs and videos the library itself accepts. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Presign failures, mapped to the admin.upload.* key that explains each one.
 * The route answers with a code; a human needs a sentence.
 */
export const PRESIGN_ERROR_KEYS: Record<string, string> = {
  S3_NOT_CONFIGURED: "notConfigured",
  UNSUPPORTED_TYPE: "unsupportedType",
  FILE_TOO_LARGE: "tooLarge",
  RATE_LIMITED: "rateLimited",
  UNAUTHORISED: "sessionExpired",
  TWO_FACTOR_SETUP_REQUIRED: "twoFactorRequired",
};

/**
 * XHR rather than fetch, for one reason: upload progress. fetch still has
 * no way to observe how much of a request body has gone out, and a 20MB
 * photo over hotel wifi with no progress bar reads as a hung page.
 */
export function putToS3(
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
export function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
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

export type UploadOk = {
  ok: true;
  id: string;
  url: string;
  key: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
};

/**
 * `messageKey` is a key under admin.upload.*; `reason` carries the raw code
 * for the one case that has no specific message and has to be shown as-is.
 * Kept apart so the caller decides how to phrase it — the editor shows a
 * toast, the library button shows a row.
 */
export type UploadError = {
  ok: false;
  messageKey?: string;
  reason?: string;
};

/**
 * The whole flow, start to finish. Returns rather than throws, because
 * every caller has to render the failure somewhere rather than let it
 * escape — and "the file was too big" is an outcome, not an exception.
 */
export async function uploadToLibrary(
  locale: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadOk | UploadError> {
  if (file.size > MAX_BYTES) return { ok: false, messageKey: "tooLarge" };

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
    const messageKey = code ? PRESIGN_ERROR_KEYS[code] : undefined;
    return messageKey
      ? { ok: false, messageKey }
      : { ok: false, reason: code ?? `HTTP ${response.status}` };
  }

  const dims = await readImageDimensions(file);

  await putToS3(
    result.uploadUrl,
    file,
    result.headers ?? { "Content-Type": result.contentType },
    onProgress,
  );

  const created = await createMedia(locale, {
    url: result.publicUrl,
    key: result.key,
    mimeType: file.type,
    width: dims.width,
    height: dims.height,
    sizeBytes: file.size,
  });

  if (!created.ok || !created.id) return { ok: false, messageKey: "failed" };

  return {
    ok: true,
    id: created.id,
    url: result.publicUrl,
    key: result.key ?? null,
    mimeType: file.type,
    width: dims.width ?? null,
    height: dims.height ?? null,
    sizeBytes: file.size,
  };
}
