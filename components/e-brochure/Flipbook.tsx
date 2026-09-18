"use client";

/**
 * components/e-brochure/Flipbook.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * StPageFlip, wrapped so React and it do not fight over the same DOM.
 *
 * Four things about this library shape the whole file, and all four were
 * confirmed by reading its source rather than its README:
 *
 *  1. **Its enums are `const enum`, so they do not exist at runtime.** The
 *     bundle exports exactly one binding, `PageFlip`. `@types/page-flip`
 *     re-declares SizeType, Orientation and friends as ordinary enums, so
 *     TypeScript will happily accept `import { SizeType } from "page-flip"`
 *     and hand you `undefined`. Everything here uses string literals, and
 *     nothing but `PageFlip` is imported.
 *
 *  2. **A turning page is drawn by cloning its element**
 *     (HTMLPage.newTemporaryCopy → cloneNode(true)). A cloned `<canvas>`
 *     has a blank bitmap, so a canvas page turns white mid-flip. Pages
 *     here are `<img>`, which clone with their src intact — see the header
 *     of usePdfPages.ts.
 *
 *  3. **It reparents and restyles its children every frame.** UI adds
 *     .stf__parent, injects .stf__wrapper/.stf__block, moves every page
 *     element into it and rewrites style.cssText continuously. React
 *     reconciling those nodes is a guaranteed conflict — so React renders
 *     one empty host div, and the pages are built with
 *     document.createElement inside an effect that owns them for their
 *     whole life.
 *
 *  4. **Settings.getSettings() throws on flippingTime <= 0**, so "no
 *     animation" is not expressible. Reduced motion is handled by
 *     rendering PagedView instead of this file at all.
 *
 * And one thing about how it is *used* here, which is the whole reason the
 * file reads the way it does: **the book is sized in `fixed` mode from
 * numbers this component is handed, not in `stretch` mode from whatever
 * the library measures.** See the note above `layout` below.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { PageFlip } from "page-flip";
import type { PdfPages } from "./usePdfPages";

export type FlipbookHandle = {
  flipNext: () => void;
  flipPrev: () => void;
  turnTo: (index: number) => void;
};

type Props = {
  pages: PdfPages;
  /** Fires for a drag, a swipe or a corner click — anything not from us. */
  onIndexChange: (index: number) => void;
  /** Portrait/landscape, so the toolbar can label the spread correctly. */
  onOrientationChange?: (orientation: "portrait" | "landscape") => void;
  /** Zoomed in, the pointer belongs to panning rather than flipping. */
  interactive: boolean;
  /**
   * Show one page even where there is room for two.
   *
   * Set by the caller in fullscreen, but only on a portrait screen — a
   * phone held upright, where a spread of two landscape pages (2.83:1)
   * would be squeezed into a fraction of the available height, leaving
   * each page smaller than showing one alone would. On a landscape
   * screen fullscreen opens to a spread instead, the way a printed
   * brochure does; the box-fitting math below sizes it correctly either
   * way, so this prop is the only thing standing between one page and
   * two.
   */
  forceSinglePage?: boolean;
  /**
   * The box the whole book has to fit inside, in CSS pixels, measured by
   * the viewer. Null until the first measurement, which is one commit and
   * no paint — nothing is drawn at a guessed size in the meantime.
   */
  box: { width: number; height: number } | null;
  /**
   * Page to open on. Read only when the book is built, so a rebuild —
   * entering fullscreen, a resize, crossing the breakpoint — resumes where
   * the reader was instead of snapping back to the cover.
   */
  currentIndex: number;
  pageLabel: (index: number) => string;
  handleRef: RefObject<FlipbookHandle | null>;
};

/** A page shell: a fixed-size div whose <img> src is filled in later. */
function createPageElement(index: number, isCover: boolean): HTMLDivElement {
  const page = document.createElement("div");
  page.className = "stf-page bg-white";
  /*
    Covers get density "hard", which is the one case StPageFlip animates
    with a real rotateY rather than a clipped fold. It is the closest this
    library comes to the reference's 3D curl, so the front and back covers
    are where it is worth spending.
  */
  page.setAttribute("data-density", isCover ? "hard" : "soft");

  const image = document.createElement("img");
  image.className = "h-full w-full object-contain";
  image.alt = "";
  image.dataset.pageIndex = String(index);
  image.draggable = false;

  page.appendChild(image);
  return page;
}

export default function Flipbook({
  pages,
  onIndexChange,
  onOrientationChange,
  interactive,
  forceSinglePage = false,
  box,
  currentIndex,
  pageLabel,
  handleRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  /** Set while we drive the flip ourselves, so the echo is not re-emitted. */
  const drivingRef = useRef(false);

  /*
    Where a rebuild should open the book.

    Assigned during render rather than in an effect on purpose: the build
    effect below is declared first, so on the commit where both the size
    and the page have changed, an effect-assigned ref would still hold the
    previous page when the book is rebuilt from it.
  */
  const openAtRef = useRef(currentIndex);
  // eslint-disable-next-line react-hooks/refs -- assigned during render on purpose; see the comment above. An effect would hand the rebuild the previous page.
  openAtRef.current = currentIndex;

  useImperativeHandle(
    handleRef,
    () => ({
      flipNext: () => {
        drivingRef.current = true;
        flipRef.current?.flipNext();
      },
      flipPrev: () => {
        drivingRef.current = true;
        flipRef.current?.flipPrev();
      },
      turnTo: (index: number) => {
        drivingRef.current = true;
        flipRef.current?.turnToPage(index);
      },
    }),
    [],
  );

  const { pageCount, aspectRatio } = pages;

  /*
    One page at a time below the md breakpoint, a spread above it.

    StPageFlip decides this itself, but on a rule that cannot be steered:
    it goes portrait when the container is narrower than `2 * minWidth`,
    and in `stretch` mode `minWidth` doubles as the CSS min-width it puts
    on its own root. The two cannot be tuned separately — raising the
    threshold to cover a large phone also sets a min-width that overflows a
    small one.

    Worse, the default threshold lands at ~400px, which is inside the range
    real phones occupy: the same handset was single-page in the page and a
    spread in fullscreen, because fullscreen handed it the whole viewport.
    And for a landscape brochure — which is what a sale kit usually is — a
    spread is a 2.8:1 strip that is unreadable at any phone width.

    So the breakpoint is ours. What makes it stick is `layout` below: in
    `fixed` mode the same rule reads `blockWidth < pageWidth * 2` against a
    page width we chose and a block width we set, so the answer is decided
    here rather than measured.
  */
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Fullscreen on a portrait screen forces it too — see forceSinglePage on
  // Props.
  const singlePage = narrow || forceSinglePage;

  /*
    The size of one page, in pixels, decided here.

    This is the fix for "fullscreen leaves the book at 46% of the screen".
    In `stretch` mode StPageFlip derives everything from one number it
    measures itself — the width of its own block — and consults nothing
    else:

      - the height never enters the calculation. Its `maxHeight` setting is
        not read in stretch mode at all, and the one clamp that looks like
        it might help (`pageHeight > getBlockHeight()`) measures a box the
        library sized itself, so it reads back its own answer. A spread of
        two A4-landscape pages is 2.83:1; stretched across a 16:9 screen
        that is a 46%-tall strip with the rest of the screen left empty.
      - the *orientation* comes from the same measurement, against a
        `minWidth` frozen when the book was built. Every attempt to steer
        it therefore depended on the container having already reached its
        final width at the moment of construction — which, entering
        fullscreen, is exactly what is not true. Whichever frame the
        library happened to measure decided whether the reader got one page
        or two, and it disagreed between browsers.

    So the width is not what is chosen; the *height* is. The book gets the
    largest page that fits the box in both directions, and both dimensions
    go to the library as `fixed` values. `pagesAcross * pageWidth` is then
    the exact width of the block, which makes the library's own portrait
    test (`blockWidth < pageWidth * 2`) come out the way we intend by
    construction — true for one page across, false for two — no matter when
    it runs or what the layout was doing at the time.
  */
  const pagesAcross = singlePage ? 1 : 2;

  const layout = useMemo(() => {
    if (!box) return null;

    // Whichever binds: the width on a phone holding a landscape page, the
    // height on a wide screen. Floored, so a book can never round its way
    // past the box and put a scrollbar on a fullscreen viewer.
    const bookWidth = Math.min(box.width, box.height * aspectRatio * pagesAcross);
    const pageWidth = Math.max(Math.floor(bookWidth / pagesAcross), 40);

    return { pageWidth, pageHeight: Math.round(pageWidth / aspectRatio) };
  }, [box, aspectRatio, pagesAcross]);

  const pageWidth = layout?.pageWidth ?? 0;
  const pageHeight = layout?.pageHeight ?? 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || pageCount === 0 || pageWidth === 0) return;

    /*
      A throwaway container between React's div and the library's DOM.
      PageFlip mutates whatever it is handed beyond recognition; giving it
      a node React has never rendered means cleanup is one removeChild
      rather than an attempt to restore something React believes it owns.
    */
    const inner = document.createElement("div");
    host.appendChild(inner);

    const pageElements = Array.from({ length: pageCount }, (_, index) =>
      createPageElement(index, index === 0 || index === pageCount - 1),
    );
    for (const element of pageElements) inner.appendChild(element);

    const flip = new PageFlip(inner, {
      /*
        Real pixels, not a nominal ratio — see the note above `layout`.
        min/max width and height are deliberately absent: in `fixed` mode
        Settings.getSettings() overwrites all four with width/height
        anyway, so passing them would only suggest they do something.
      */
      width: pageWidth,
      height: pageHeight,
      // Literals, never the erased enums — see note 1 in the header.
      size: "fixed",
      // Required for one-page mode to be reachable at all: it is what lets
      // `blockWidth < pageWidth * 2` resolve to portrait rather than being
      // ignored.
      usePortrait: true,
      // Resume where the reader was. A rebuild is no longer rare — every
      // resize is one — and StPageFlip has no way to be told after the
      // fact, so it goes in as a setting.
      startPage: openAtRef.current,
      showCover: true,
      drawShadow: true,
      // 0.6 rather than the default: the shadow is most of what sells a
      // fold as three-dimensional in a library that does not curve pages.
      maxShadowOpacity: 0.6,
      flippingTime: 700,
      // Let a touch that starts on the book still scroll the page.
      mobileScrollSupport: true,
      // The toolbar buttons are React's; a click reaching the book as well
      // would turn two pages.
      clickEventForward: false,
      swipeDistance: 30,
      showPageCorners: true,
      useMouseEvents: interactive,
    } as unknown as ConstructorParameters<typeof PageFlip>[1]);

    flip.loadFromHTML(pageElements);
    flipRef.current = flip;

    flip.on("flip", (event) => {
      const index = Number(event.data);

      if (drivingRef.current) {
        // Our own turnToPage/flipNext echoing back; the parent already
        // knows, and telling it again would fight its own state.
        drivingRef.current = false;
        return;
      }

      onIndexChange(index);
    });

    /*
      Report the orientation rather than wait to be told it.

      StPageFlip announces its own, but only when it *changes*, and the
      first one is decided inside loadFromHTML above — before there is
      anywhere to subscribe. That was survivable while the library could
      change its mind on a later resize; now that each size builds its own
      book the event can never fire again, and the toolbar would spend the
      whole session believing a spread was a single page, stepping one page
      at a time through a book turning two.

      Which is no loss, because the orientation is not the library's
      decision any more: `pagesAcross` is what it was built with, and the
      listener below stays only to catch it disagreeing.
    */
    onOrientationChange?.(pagesAcross === 1 ? "portrait" : "landscape");

    flip.on("changeOrientation", (event) => {
      onOrientationChange?.(event.data === "portrait" ? "portrait" : "landscape");
    });

    /*
      No ResizeObserver, and no `update()` on fullscreenchange.

      Both used to live here, and between them they were three quarters of
      this effect: the library only recalculates on a window `resize`, that
      resize fires while the element is still laid out at its in-page size,
      and nothing resizes it again afterwards — so the book kept a page
      size and a left offset computed for the old container and sat, small
      and off to one side, in the new one. The observer chased it; a burst
      of `update()` calls across the next eight frames chased the frames
      the observer missed.

      Every one of those was a workaround for the size being *measured*
      here. It is not any more: the size arrives as a prop, and a new size
      re-runs this effect and builds a book that is already right. There is
      nothing left for a re-measure to discover.
    */

    return () => {
      flipRef.current = null;
      try {
        flip.destroy();
      } catch {
        // destroy() throws if the library never finished initialising —
        // a fast unmount during load. The node removal below is what
        // actually matters.
      }
      inner.remove();
    };
    // onIndexChange/onOrientationChange are excluded deliberately: they are
    // recreated on every parent render, and rebuilding the entire book —
    // and every page bitmap with it — because a callback identity changed
    // would be a catastrophic amount of work. They are read through the
    // closure, which is correct because the parent keeps them stable with
    // useCallback.
    //
    // The page size IS in the list: it is a construction-time setting in
    // fixed mode, so a new size means a new book. That is the "key to force
    // a remount" this needs — the effect's own teardown is the remount, and
    // the viewer debounces the size so a drag cannot thrash it.
    //
    // So is pagesAcross, and not only because the orientation changes with
    // it: when the height is what binds, one page and two come out at the
    // *same* page size (half the width, half the pages), so the size alone
    // would not notice the switch and the book would stay a spread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount, pageWidth, pageHeight, pagesAcross]);

  /*
    Pointer ownership. Zoomed in, a drag has to pan the image; zoomed out,
    it has to turn the page. Without this the two gestures collide and the
    symptom reads as "the flip randomly stopped working".
  */
  useEffect(() => {
    const flip = flipRef.current;
    if (!flip) return;

    const settings = (flip as unknown as { setting?: { useMouseEvents: boolean } })
      .setting;
    if (settings) settings.useMouseEvents = interactive;
  }, [interactive]);

  /*
    Fill in the page images as they finish rasterising.

    No dependency array on purpose. usePdfPages hands back a stable srcFor
    and signals new work by re-rendering, so there is no value here that
    changes — the render itself is the event. The body is a handful of
    attribute writes over elements React does not own, which is exactly the
    case an effect-on-every-render is for.
  */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    for (const image of host.querySelectorAll<HTMLImageElement>("img[data-page-index]")) {
      const index = Number(image.dataset.pageIndex);
      const src = pages.srcFor(index);

      if (src && image.src !== src) {
        image.src = src;
        image.alt = pageLabel(index);
      }
    }
  });

  /*
    Sized in pixels, not stretched.

    The library reads this element's width to decide both how big a page is
    and whether to draw one or two of them, and `width: 100%` meant the
    answer changed with whatever the layout happened to be doing that
    frame. An exact width settles both: `pagesAcross * pageWidth` is what
    `getBlockWidth()` reads back, so the portrait test resolves the way
    `layout` intended.

    The height is stated too, so the box is the same size before the book
    is built as after — a resize moves the toolbar once, not twice — and it
    is exactly the height the library's own aspect-ratio padding produces,
    so it neither clips a page nor leaves a strip of background under one.

    `mx-auto` is what centres it; `justify-center` on the fullscreen shell
    handles the other axis.
  */
  return (
    <div
      ref={hostRef}
      className="mx-auto"
      style={
        layout
          ? { width: layout.pageWidth * pagesAcross, height: layout.pageHeight }
          : // Before the first measurement. The aspect is known, so the
            // space the book is about to occupy can be held open without
            // guessing at a size for it.
            { width: "100%", aspectRatio: aspectRatio * pagesAcross }
      }
    />
  );
}
