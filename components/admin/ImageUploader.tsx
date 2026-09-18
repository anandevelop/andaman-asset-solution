"use client";

/**
 * components/admin/ImageUploader.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Direct-to-S3 upload with a real progress bar, plus a paste-a-URL escape
 * hatch.
 *
 * Two implementation notes worth knowing:
 *
 *  • XMLHttpRequest, not fetch. fetch() has no upload-progress event in any
 *    shipping browser, and a villa photo on a Phuket 4G connection takes
 *    long enough that a spinner with no percentage feels broken.
 *
 *  • The URL is mirrored into a hidden input, so this component drops into
 *    the existing FormData-based admin forms without any of them needing to
 *    become controlled. The forms keep working with JavaScript disabled —
 *    minus the upload, which was never going to work anyway.
 *
 * Supports both single-image fields (hero, cover) and ordered lists
 * (gallery, monthly progress) through the `multiple` prop.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  ImageOff,
  Link2,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";

type Props = {
  /** Form field name. Receives a URL, or newline-joined URLs when multiple. */
  name: string;
  /** Bucket folder — "projects" | "news" | "events" | "progress". */
  prefix: string;
  /** Second path segment, usually the record slug. */
  slug?: string;
  defaultValue?: string;
  multiple?: boolean;
  label: string;
  hint?: string;
  /**
   * "image" (default) or "document" for PDF brochures. Documents are
   * always single, never reorderable, and get the larger size allowance.
   */
  kind?: "image" | "document";
  /**
   * Widens the picker to also accept video/mp4 + video/webm (see
   * HeroStorySlide.mediaType in schema.prisma) and gives a video file the
   * larger MAX_VIDEO_BYTES allowance instead of the image cap — a few
   * seconds of 1080p footage legitimately outweighs a photo by 5-10x.
   * Ignored when kind is "document".
   */
  acceptVideo?: boolean;
  /**
   * Fires with the newline-joined URL list whenever it changes — the same
   * value the hidden input carries. This component stays uncontrolled (see
   * the file header) for every existing FormData-based caller; this is an
   * opt-in for the rare caller that also needs the current value outside
   * the form, e.g. PageSeoEditor.tsx mirroring it into a live preview.
   */
  onChange?: (value: string) => void;
};

const ACCEPT = {
  image: "image/jpeg,image/png,image/webp,image/avif",
  document: "application/pdf",
} as const;

/** Appended to ACCEPT.image's list when `acceptVideo` is set. */
const VIDEO_ACCEPT = "video/mp4,video/webm";

const MAX_BYTES = {
  image: 15 * 1024 * 1024,
  // A print-resolution brochure is legitimately larger than a photograph.
  document: 50 * 1024 * 1024,
  // A few seconds of 1080p story-banner footage, legitimately larger than
  // either — mirrors lib/s3.ts's MAX_VIDEO_BYTES.
  video: 100 * 1024 * 1024,
} as const;

/**
 * Every error code POST /api/uploads/presign can answer with, mapped to the
 * message that tells the operator what to do about it.
 *
 * Kept as a table rather than a ternary chain so that adding a code to the
 * route and forgetting it here is visible: an unmapped code falls through
 * to failedWithReason, which prints the code itself.
 */
const PRESIGN_ERROR_KEYS: Record<string, string> = {
  S3_NOT_CONFIGURED: "notConfigured",
  UNSUPPORTED_TYPE: "unsupportedType",
  FILE_TOO_LARGE: "tooLarge",
  RATE_LIMITED: "rateLimited",
  // Both are a 403, and they are not the same problem: one is fixed by
  // signing in again, the other by finishing enrolment at
  // /admin/account/security. The route has always distinguished them; the
  // uploader did not.
  UNAUTHORISED: "sessionExpired",
  TWO_FACTOR_SETUP_REQUIRED: "twoFactorRequired",
};

/** Extension-based, not content-sniffed — matches lib/s3.ts's
 *  buildObjectKey(), which always names the object from its content type,
 *  so every URL this component ever produces (or a caller pastes via the
 *  manual-URL box) ends in a recognisable extension. */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)$/i.test(url);
}

type Upload = { id: string; name: string; progress: number; error?: string };

/** PUT one file to a presigned URL, reporting progress. */
function putToS3(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);

    /*
      Replay the signed headers verbatim.

      The signature covers Content-Type and the object ACL; a missing or
      altered header is a 403 from the storage provider, not a validation
      error we can explain. Sending back exactly what the server signed
      means the two can never drift apart.
    */
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(xhr.status === 403 ? "DENIED" : `HTTP_${xhr.status}`));

    /*
      onerror fires with status 0 for far more than a dead network.

      A cross-origin *error* response from Spaces carries no CORS headers,
      so the browser refuses to expose it and XHR sees a network failure —
      a 400 for a malformed request, a 403 for an expired URL or a revoked
      key, and a genuinely blocked preflight are indistinguishable here.
      This was read as "must be CORS" for a long time while the real cause
      was a signed header the uploader was not sending; see the header
      parity test in tests/s3.test.ts.

      Which is why the onload branch below still checks for 403 even though
      it is only reachable same-origin: the status is worth reporting on the
      rare occasion the browser lets us see it.
    */
    xhr.onerror = () => reject(new Error("BLOCKED"));
    xhr.onabort = () => reject(new Error("ABORTED"));

    xhr.send(file);
  });
}

/**
 * One image in the sortable grid.
 *
 * The drag handle is a dedicated grip, not the whole tile. Making the tile
 * draggable would swallow the click on the remove button — a classic
 * drag-and-drop regression where deleting an image starts a drag instead.
 *
 * The arrow buttons stay. dnd-kit's keyboard sensor works, but discovering
 * it requires knowing to tab to a grip and press space; two arrows are
 * self-evident, and on a phone they are far easier than a long-press drag.
 */
function SortableImage({
  url,
  index,
  total,
  multiple,
  broken,
  isVideo,
  labels,
  onRemove,
  onMove,
  onBroken,
}: {
  url: string;
  index: number;
  total: number;
  multiple: boolean;
  broken: boolean;
  isVideo: boolean;
  labels: { remove: string; moveUp: string; moveDown: string; drag: string };
  onRemove: () => void;
  onMove: (delta: number) => void;
  onBroken: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: url, disabled: !multiple });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Lift the dragged tile above its neighbours.
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`group relative h-24 w-32 overflow-hidden rounded-xs border bg-surface-muted ${
        isDragging
          ? "border-accent opacity-90 shadow-cardHover"
          : "border-primary/10"
      }`}
    >
      {broken ? (
        <span className="flex h-full w-full items-center justify-center text-ink-muted">
          <ImageOff size={16} aria-hidden />
        </span>
      ) : isVideo ? (
        // Real playback controls, not just a static frame — the admin
        // needs to confirm the right clip landed, including its audio.
        <video
          src={url}
          controls
          muted
          playsInline
          className="h-full w-full object-cover"
          onError={onBroken}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
          onError={onBroken}
        />
      )}

      {multiple && (
        <>
          <span className="absolute left-0 top-0 bg-primary/80 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
            {index + 1}
          </span>

          <button
            type="button"
            aria-label={labels.drag}
            className="absolute right-0 top-0 cursor-grab bg-primary/80 px-1 py-1 text-white/80 transition-opacity hover:text-white active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={13} aria-hidden />
          </button>
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-primary/80 px-1.5 py-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {multiple ? (
          <span className="flex gap-0.5">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label={labels.moveUp}
              className="text-white/80 hover:text-white disabled:opacity-30"
            >
              <ArrowUp size={13} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              aria-label={labels.moveDown}
              className="text-white/80 hover:text-white disabled:opacity-30"
            >
              <ArrowDown size={13} aria-hidden />
            </button>
          </span>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={labels.remove}
          className="text-white/80 hover:text-red-300"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export default function ImageUploader({
  name,
  prefix,
  slug,
  defaultValue = "",
  multiple = false,
  label,
  hint,
  kind = "image",
  acceptVideo = false,
  onChange,
}: Props) {
  // A brochure is one file, and "reordering" a single PDF is meaningless.
  const isDocument = kind === "document";
  const allowMultiple = multiple && !isDocument;
  // Documents never get video support — a brochure field only ever means PDF.
  const allowVideo = acceptVideo && !isDocument;
  const t = useTranslations("admin.upload");
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [urls, setUrls] = useState<string[]>(
    defaultValue
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  useEffect(() => {
    onChange?.(urls.join("\n"));
    // A caller passing a fresh inline arrow every render re-fires this on
    // every render of theirs, not just an actual urls change — harmless,
    // since mirroring the same joined string back is a same-value setState
    // React bails out of, but worth knowing if `onChange` ever does
    // something less idempotent than that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [manualUrl, setManualUrl] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [dragging, setDragging] = useState(false);

  const addUrls = useCallback(
    (next: string[]) => {
      setUrls((current) => {
        // De-duplicate: re-dropping the same file is a common accident.
        const merged = allowMultiple ? [...current, ...next] : next.slice(-1);
        return Array.from(new Set(merged));
      });
    },
    [allowMultiple],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);

      const selected = allowMultiple ? Array.from(files) : [files[0]];

      for (const file of selected) {
        const id = `${file.name}-${Date.now()}-${Math.random()}`;

        // A video file gets the larger allowance; anything else (including
        // a video picked when acceptVideo is off, which the `accept`
        // attribute already discourages but doesn't strictly prevent) is
        // checked against the field's normal cap.
        const isVideoFile = allowVideo && file.type.startsWith("video/");
        const cap = isVideoFile ? MAX_BYTES.video : MAX_BYTES[kind];

        if (file.size > cap) {
          setUploads((u) => [
            ...u,
            {
              id,
              name: file.name,
              progress: 0,
              error: isVideoFile
                ? t("tooLargeVideo")
                : isDocument
                  ? t("tooLargeDocument")
                  : t("tooLarge"),
            },
          ]);
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
              prefix,
              slug,
            }),
          });

          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.ok) {
            const code: string | undefined = result?.error;
            const key = code ? PRESIGN_ERROR_KEYS[code] : undefined;

            /*
              Anything without a name shows its code rather than collapsing
              into "upload failed".

              Five distinct causes used to land on that one line —
              UNAUTHORISED, TWO_FACTOR_SETUP_REQUIRED, VALIDATION_FAILED,
              INVALID_JSON and SERVER_ERROR — which made a working bucket
              and an expired session look identical to whoever was
              uploading, and left nothing to go on but the browser console.
              A screenshot should be enough to tell them apart.
            */
            const message = key
              ? t(key as never)
              : t("failedWithReason", { reason: code ?? `HTTP ${response.status}` });

            setUploads((u) =>
              u.map((item) => (item.id === id ? { ...item, error: message } : item)),
            );
            console.error(
              `[upload] ${file.name}: presign refused — HTTP ${response.status} ${code ?? "(no code)"}`,
            );
            continue;
          }

          await putToS3(
            result.uploadUrl,
            file,
            result.headers ?? { "Content-Type": result.contentType },
            (percent) =>
              setUploads((u) =>
                u.map((item) => (item.id === id ? { ...item, progress: percent } : item)),
              ),
          );

          addUrls([result.publicUrl]);
          setUploads((u) => u.filter((item) => item.id !== id));
        } catch (error) {
          const reason = error instanceof Error ? error.message : "";
          const message =
            reason === "BLOCKED"
              ? t("storageBlocked")
              : reason === "DENIED"
                ? t("storageDenied")
                : // putToS3 rejects with `HTTP_<status>` for any other
                  // refusal from storage. Showing the status is the
                  // difference between "it broke" and a fixable report.
                  reason.startsWith("HTTP_")
                  ? t("failedWithReason", { reason: reason.replace("HTTP_", "HTTP ") })
                  : t("failed");

          setUploads((u) =>
            u.map((item) => (item.id === id ? { ...item, error: message } : item)),
          );

          // The UI has room for one short line; the console gets the detail
          // whoever is debugging actually needs.
          console.error(`[upload] ${file.name} failed: ${reason || error}`);
        }
      }

      // Allow re-selecting the same file after a removal.
      if (inputRef.current) inputRef.current.value = "";
    },
    [addUrls, allowMultiple, allowVideo, isDocument, kind, prefix, slug, t],
  );

  const remove = (url: string) => setUrls((u) => u.filter((item) => item !== url));

  /** Order is meaningful — gallery position, progress-photo sequence. */
  const move = (index: number, delta: number) => {
    setUrls((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  /*
    Drag sensors.

    PointerSensor needs a small activation distance or a click on the grip
    registers as a zero-length drag and the button never fires. 6px is
    below the threshold of an intentional drag and above hand tremor on a
    trackpad.
  */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Dropped outside, or back where it started.
    if (!over || active.id === over.id) return;

    setUrls((current) => {
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));

      return from === -1 || to === -1 ? current : arrayMove(current, from, to);
    });
  };

  const addManual = () => {
    const value = manualUrl.trim();
    if (!value) return;

    if (!/^https:\/\//i.test(value)) {
      setError(t("httpsOnly"));
      return;
    }

    addUrls([value]);
    setManualUrl("");
    setError(null);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="admin-label mb-0">
          {label}
        </label>

        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-primary"
        >
          <Link2 size={12} aria-hidden />
          {showManual ? t("hideUrl") : t("pasteUrl")}
        </button>
      </div>

      {/* The value the surrounding form actually submits. */}
      <input type="hidden" name={name} value={urls.join("\n")} readOnly />

      {/* ── Drop zone ─────────────────────────────────────────────── */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`rounded-xs border border-dashed px-5 py-6 text-center transition-colors ${
          dragging
            ? "border-accent bg-accent/6"
            : "border-primary/20 bg-surface-muted/40"
        }`}
      >
        <input
          ref={inputRef}
          id={fieldId}
          type="file"
          accept={allowVideo ? `${ACCEPT[kind]},${VIDEO_ACCEPT}` : ACCEPT[kind]}
          multiple={allowMultiple}
          onChange={(event) => void handleFiles(event.target.files)}
          className="sr-only"
        />

        <UploadCloud
          size={22}
          strokeWidth={1.5}
          className="mx-auto text-ink-muted"
          aria-hidden
        />

        <p className="mt-2 text-sm text-ink">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-accent-700 underline underline-offset-2"
          >
            {t("choose")}
          </button>{" "}
          {t("orDrop")}
        </p>
        <p className="admin-hint mt-1">
          {t(isDocument ? "constraintsDocument" : allowVideo ? "constraintsMedia" : "constraints")}
        </p>
      </div>

      {hint && <p className="admin-hint">{hint}</p>}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {error}
        </p>
      )}

      {/* ── Manual URL ────────────────────────────────────────────── */}
      {showManual && (
        <div className="mt-3 flex gap-2">
          <input
            type="url"
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            onKeyDown={(event) => {
              // Enter inside a nested field must not submit the whole form.
              if (event.key === "Enter") {
                event.preventDefault();
                addManual();
              }
            }}
            placeholder="https://…"
            className="admin-input font-mono text-xs"
          />
          <button type="button" onClick={addManual} className="admin-btn-ghost shrink-0">
            {t("add")}
          </button>
        </div>
      )}

      {/* ── In-flight uploads ─────────────────────────────────────── */}
      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2">
          {uploads.map((upload) => (
            <li key={upload.id} className="rounded-xs border border-primary/10 px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-ink">{upload.name}</span>

                {upload.error ? (
                  <span className="flex shrink-0 items-center gap-1 text-red-700">
                    <AlertCircle size={12} aria-hidden />
                    {upload.error}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-ink-muted">
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    {upload.progress}%
                  </span>
                )}
              </div>

              {!upload.error && (
                <div
                  role="progressbar"
                  aria-valuenow={upload.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={upload.name}
                  className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/10"
                >
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              )}

              {upload.error && (
                <button
                  type="button"
                  onClick={() =>
                    setUploads((u) => u.filter((item) => item.id !== upload.id))
                  }
                  className="mt-1 text-xs text-ink-muted underline"
                >
                  {t("dismiss")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Attached document ─────────────────────────────────────── */}
      {isDocument && urls.length > 0 && (
        <ul className="mt-4 space-y-2">
          {urls.map((url) => (
            <li
              key={url}
              className="flex items-center gap-3 rounded-xs border border-primary/10 bg-surface-muted/50 px-3 py-2.5"
            >
              <FileText size={18} className="shrink-0 text-accent-700" aria-hidden />

              {/* A PDF has no thumbnail worth rendering, so the useful
                  affordance is opening it to check the right file landed. */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-mono text-xs text-accent-700 hover:underline"
              >
                {url.split("/").pop()}
              </a>

              <button
                type="button"
                onClick={() => remove(url)}
                aria-label={t("remove")}
                className="shrink-0 text-ink-muted transition-colors hover:text-red-600"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── Current images ────────────────────────────────────────── */}
      {!isDocument && urls.length > 0 && (
        <>
          <p className="admin-hint mt-4">
            {t("count", { count: urls.length })}
            {allowMultiple && urls.length > 1 && ` · ${t("reorderHint")}`}
          </p>

          <DndContext
            sensors={sensors}
            // closestCenter suits a wrapping grid; the pointer-based
            // strategies assume a single row or column.
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            {/* The URL is the sortable id — already unique, since addUrls
                de-duplicates. */}
            <SortableContext items={urls} strategy={rectSortingStrategy}>
              <ul className="mt-2 flex flex-wrap gap-3">
                {urls.map((url, index) => (
                  <SortableImage
                    key={url}
                    url={url}
                    index={index}
                    total={urls.length}
                    multiple={allowMultiple}
                    broken={Boolean(broken[url])}
                    isVideo={allowVideo && isVideoUrl(url)}
                    labels={{
                      remove: t("remove"),
                      moveUp: t("moveUp"),
                      moveDown: t("moveDown"),
                      drag: t("dragToReorder"),
                    }}
                    onRemove={() => remove(url)}
                    onMove={(delta) => move(index, delta)}
                    onBroken={() => setBroken((prev) => ({ ...prev, [url]: true }))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
