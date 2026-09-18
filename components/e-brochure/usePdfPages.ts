"use client";

/**
 * components/e-brochure/usePdfPages.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Loads a PDF with pdf.js and keeps a small window of its pages rasterised
 * as object URLs.
 *
 * Two decisions worth knowing before changing anything here.
 *
 * **Pages are <img> elements, not <canvas>.** StPageFlip draws the folded
 * half of a turning page by cloning the page element
 * (HTMLPage.newTemporaryCopy → cloneNode(true)), and a cloned canvas has a
 * blank bitmap. A live canvas in a page turns the leaf white mid-flip. An
 * <img> clone keeps its src and paints from the image cache, so this hook
 * renders off-screen and hands out blob: URLs.
 *
 * **Only a window of pages is resident.** Rasterising all 40 pages of a
 * brochure up front costs 40 decodes and 40 live blobs before the first
 * flip; rendering only the visible pair means a blank leaf every time
 * someone turns one. lib/pdf-render.ts's spreadWindow picks the middle.
 * Everything outside it is cancelled, revoked and re-rendered on return.
 *
 * pdfjs-dist is imported dynamically, inside the effect. It must never
 * reach the server bundle — see the note on the dynamic() calls in
 * components/EBrochureViewer.tsx.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeRenderScale,
  PDFJS_ASSET_BASE,
  PDFJS_LIBRARY_URL,
  PDFJS_WORKER_URL,
} from "@/lib/pdf-render";

export type PdfStatus = "loading" | "ready" | "error";

/** Rasterise at most this many pixels per page — see computeRenderScale. */
const MAX_PIXELS = 4_000_000;

/** Width a page is drawn at, in CSS pixels, before the DPR multiplier. */
const TARGET_CSS_WIDTH = 900;

type Rendered = {
  url: string;
  /** Cancelled when the page leaves the window mid-render. */
  cancel: () => void;
};

export type PdfPages = {
  status: PdfStatus;
  pageCount: number;
  /** width / height of page one, for sizing the container before load. */
  aspectRatio: number;
  /** Blob URL for a 0-based page index, or undefined while it renders. */
  srcFor: (index: number) => string | undefined;
  /** Render these 0-based indices, and drop everything else. */
  ensureWindow: (indices: number[]) => void;
};

export function usePdfPages(fileUrl: string): PdfPages {
  const [status, setStatus] = useState<PdfStatus>("loading");
  const [pageCount, setPageCount] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(1 / Math.SQRT2); // A4 portrait

  /*
    The rendered pages live in a ref, not in state: they are mutated from
    async callbacks that must not race a React render, and the component
    only needs to know *that* something changed. `revision` is that signal.
  */
  const rendered = useRef(new Map<number, Rendered>());
  const [, setRevision] = useState(0);
  const bumpRevision = useCallback(() => setRevision((n) => n + 1), []);

  const documentRef = useRef<{ getPage: (n: number) => Promise<unknown> } | null>(null);
  const inFlight = useRef(new Set<number>());
  /** Guards every async continuation against a document that has gone. */
  const generation = useRef(0);

  useEffect(() => {
    const thisGeneration = (generation.current += 1);
    let loadingTask: {
      destroy: () => Promise<void>;
      promise: Promise<unknown>;
    } | null = null;

    // Captured for the cleanup below. Both are created once per hook
    // instance and never reassigned, so this is the same object either
    // way — but reading a ref in a cleanup is a pattern worth not
    // establishing, since the next one may not be.
    const renderedPages = rendered.current;
    const pending = inFlight.current;

    async function load() {
      try {
        /*
          webpackIgnore AND turbopackIgnore, and a URL rather than the
          package name, because the bundler must not touch this file —
          neither of them, and there are now two to tell.

          pdf.min.mjs is itself a webpack bundle carrying its own
          `__webpack_require__` runtime. Nested inside Next's webpack the
          two collide, and `import("pdfjs-dist")` throws `TypeError:
          Object.defineProperty called on non-object` before any pdf.js
          code runs — the legacy build included. Importing it as a plain
          same-origin ESM URL avoids the bundler completely, and keeps a
          megabyte of PDF parser out of the app's own chunks.

          Next 16 made Turbopack the default for both `next dev` and
          `next build`, and Turbopack does not read `webpackIgnore` — it
          has its own magic comment. Without it, Turbopack's dev runtime
          intercepts the dynamic import silently: no request for
          pdf.min.mjs ever reaches the network, nothing throws, and the
          returned promise never settles, so every reader of every
          brochure sees "Loading brochure…" forever. No log line points
          at this, which is what made it worth writing down here rather
          than trusting the comment above to still be sufficient.

          scripts/copy-pdfjs-assets.mjs is what puts the file there.
        */
        const pdfjs = (await import(
          /* webpackIgnore: true */
          /* turbopackIgnore: true */
          PDFJS_LIBRARY_URL
        )) as typeof import("pdfjs-dist");

        /*
          Same-origin worker, for a second reason: given a cross-origin
          workerSrc, pdf.js re-hosts the worker from a blob: URL, which the
          site's CSP (worker-src 'self') refuses — and because that CSP
          ships Report-Only today, it would work until the day someone
          enforced it.
        */
        const base = PDFJS_ASSET_BASE;
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

        loadingTask = pdfjs.getDocument({
          url: fileUrl,
          cMapUrl: `${base}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${base}/standard_fonts/`,
          wasmUrl: `${base}/wasm/`,
          iccUrl: `${base}/iccs/`,

          /*
            Range requests on, so a 30MB brochure paints its first page
            after a few hundred KB instead of after all of it. The
            reference site this feature was modelled on turns both of
            these off, which is why it shows a loading bar for 7.5MB.

            disableAutoFetch is the other half: without it pdf.js quietly
            pulls the rest of the file in the background once the first
            page is up, and the visitor pays for pages they never open.
          */
          disableRange: false,
          disableStream: false,
          disableAutoFetch: true,
          // 64KB (the default) would mean ~460 requests for a 30MB file.
          rangeChunkSize: 262_144,

          // pdf.js uses new Function() for some embedded font programs.
          // Off, so the worker never depends on script-src 'unsafe-eval'
          // even if that token is dropped from the CSP later.
          isEvalSupported: false,
        }) as unknown as { destroy: () => Promise<void>; promise: Promise<unknown> };

        const pdf = (await loadingTask.promise) as {
          numPages: number;
          getPage: (n: number) => Promise<unknown>;
        };

        if (generation.current !== thisGeneration) return;

        documentRef.current = pdf;
        setPageCount(pdf.numPages);

        // Page one decides the shape of the whole book — StPageFlip needs
        // a fixed page size, and a container sized before the first render
        // is what stops the layout jumping when it arrives.
        const first = (await pdf.getPage(1)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number };
        };
        if (generation.current !== thisGeneration) return;

        const viewport = first.getViewport({ scale: 1 });
        setAspectRatio(viewport.width / viewport.height);
        setStatus("ready");
      } catch (error) {
        if (generation.current !== thisGeneration) return;

        console.error("[e-brochure] could not load", fileUrl, error);
        setStatus("error");
      }
    }

    void load();

    return () => {
      generation.current += 1;
      documentRef.current = null;

      for (const page of renderedPages.values()) {
        page.cancel();
        if (page.url) URL.revokeObjectURL(page.url);
      }
      renderedPages.clear();
      pending.clear();

      void loadingTask?.destroy().catch(() => {
        // Destroying a task that never resolved rejects; nothing to do.
      });
    };
  }, [fileUrl]);

  const renderPage = useCallback(
    async (index: number) => {
      const pdf = documentRef.current;
      if (!pdf || rendered.current.has(index) || inFlight.current.has(index)) return;

      const thisGeneration = generation.current;
      inFlight.current.add(index);

      try {
        // pdf.js pages are 1-based; every index in this module is 0-based.
        const page = (await pdf.getPage(index + 1)) as {
          getViewport: (o: { scale: number }) => {
            width: number;
            height: number;
          };
          render: (o: { canvas: HTMLCanvasElement; viewport: unknown }) => {
            promise: Promise<void>;
            cancel: () => void;
          };
          cleanup: () => void;
        };

        if (generation.current !== thisGeneration) return;

        const base = page.getViewport({ scale: 1 });
        const scale = computeRenderScale({
          pdfWidth: base.width,
          pdfHeight: base.height,
          cssWidth: TARGET_CSS_WIDTH,
          devicePixelRatio:
            typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
          maxPixels: MAX_PIXELS,
        });
        const viewport = page.getViewport({ scale });

        // Off-screen and never attached to the DOM — see the header note
        // on why the flipbook gets an <img> rather than this canvas.
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const task = page.render({ canvas, viewport });
        let cancelled = false;

        rendered.current.set(index, {
          url: "",
          cancel: () => {
            cancelled = true;
            task.cancel();
          },
        });

        await task.promise;

        if (cancelled || generation.current !== thisGeneration) {
          rendered.current.delete(index);
          return;
        }

        const blob = await new Promise<Blob | null>((resolve) => {
          /*
            JPEG, not PNG. A photographic brochure page as PNG is several
            megabytes; at quality 0.85 it is a few hundred KB, and the flip
            never shows it at 1:1 anyway.
          */
          canvas.toBlob((result) => resolve(result), "image/jpeg", 0.85);
        });

        // Release the bitmap the moment the blob exists — a 4M-pixel RGBA
        // canvas is 16MB, and several of those live at once is what makes
        // a mid-range phone give up.
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();

        if (!blob || cancelled || generation.current !== thisGeneration) {
          rendered.current.delete(index);
          return;
        }

        rendered.current.set(index, {
          url: URL.createObjectURL(blob),
          cancel: () => {},
        });
        bumpRevision();
      } catch (error) {
        rendered.current.delete(index);

        // A cancelled render is the normal path when someone flips fast.
        const name = error instanceof Error ? error.name : "";
        if (name !== "RenderingCancelledException") {
          console.error(`[e-brochure] page ${index + 1} failed to render`, error);
        }
      } finally {
        inFlight.current.delete(index);
      }
    },
    [bumpRevision],
  );

  const ensureWindow = useCallback(
    (indices: number[]) => {
      const wanted = new Set(indices);

      for (const [index, page] of rendered.current.entries()) {
        if (wanted.has(index)) continue;

        page.cancel();
        if (page.url) URL.revokeObjectURL(page.url);
        rendered.current.delete(index);
      }

      for (const index of indices) void renderPage(index);
    },
    [renderPage],
  );

  const srcFor = useCallback((index: number) => {
    const url = rendered.current.get(index)?.url;
    return url ? url : undefined;
  }, []);

  return { status, pageCount, aspectRatio, srcFor, ensureWindow };
}
