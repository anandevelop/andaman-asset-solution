"use client";

/**
 * components/admin/unit-types/useDraftBlueprints.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The image the preview should draw for each draft floor.
 *
 *   saved blueprint   → use it (what the public page shows)
 *   no blueprint yet  → derive one in the browser from the line drawing
 *   derive fails      → fall back to the line drawing itself
 *
 * A floor has no blueprint when its drawing was uploaded in this session
 * and not yet saved (the server derives it on save), or when a seeded plan
 * was never given one. Showing the white-paper line drawing in either case
 * puts a solid white box on the navy shaft, which reads as a broken plan.
 *
 * The derive can fail on a remote image served without CORS headers — the
 * canvas is then tainted and cannot be read back. That is the only reason
 * for the last fallback; it is not expected for public/ or Spaces uploads.
 *
 * Results are cached per URL for the life of the page, so flicking between
 * floors or tabs never re-derives, and are data: URLs, which next/image
 * passes through without trying to optimise them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from "react";
import { blueprintPixels } from "@/lib/blueprint-pixels";

const cache = new Map<string, Promise<string | null>>();

function derive(url: string): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;

  const job = new Promise<string | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        blueprintPixels(pixels.data);
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/webp", 0.9));
      } catch {
        // Tainted canvas (no CORS) — the caller falls back to the line drawing.
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });

  cache.set(url, job);
  return job;
}

type FloorImages = { key: string; imageUrl: string; blueprintImageUrl: string | null };

/** key → URL the preview should render for that floor. */
export function useDraftBlueprints(floors: FloorImages[]): Record<string, string> {
  const [derived, setDerived] = useState<Record<string, string | null>>({});

  // Only floors that need deriving, as a stable string so the effect below
  // re-runs when a drawing changes and not on every draft keystroke.
  const pending = floors
    .filter((f) => !f.blueprintImageUrl && f.imageUrl)
    .map((f) => f.imageUrl)
    .join("\n");

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    for (const url of pending.split("\n")) {
      if (url in derived) continue;
      derive(url).then((result) => {
        if (!cancelled) setDerived((current) => ({ ...current, [url]: result }));
      });
    }
    return () => {
      cancelled = true;
    };
    // `derived` is read only to skip finished URLs; listing it would re-run
    // the effect after every result for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return useMemo(
    () =>
      Object.fromEntries(
        floors.map((f) => [
          f.key,
          f.blueprintImageUrl ?? derived[f.imageUrl] ?? f.imageUrl,
        ]),
      ),
    [floors, derived],
  );
}
