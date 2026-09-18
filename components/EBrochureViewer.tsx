"use client";

/**
 * components/EBrochureViewer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The chrome around a brochure: toolbar, page counter, thumbnails, zoom,
 * fullscreen, keyboard. It owns which page is showing; the two engines
 * below it only draw.
 *
 * Strings come from useTranslations, not from props. The first cut passed
 * them down from the Server Component as a labels object, which works
 * right up until one of them needs an argument: `pageOf` and `goToPage`
 * interpolate, so they had to be passed as functions, and a function
 * cannot cross the server/client boundary. next-intl's provider is mounted
 * in app/[locale]/layout.tsx, an ancestor, so reading them here is both
 * simpler and what every other client component in this codebase does.
 *
 * The engines are loaded with `ssr: false`,
 * which is what keeps pdfjs-dist out of the server bundle entirely — it
 * reaches for browser globals the moment it is imported. If that ever
 * surfaces as a build error, the fix is to keep it client-only, NOT to add
 * it to serverExternalPackages: that would ship a megabyte of PDF parser
 * into the server runtime to paper over an import that should not happen.
 *
 * The download link is present in every state, including while loading and
 * after a failure. A visitor who cannot read the brochure here must always
 * be one click from the file itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileDown,
  LayoutGrid,
  Maximize,
  Minimize,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { spreadWindow } from "@/lib/pdf-render";
import { usePdfPages } from "./e-brochure/usePdfPages";
import type { FlipbookHandle } from "./e-brochure/Flipbook";

const Flipbook = dynamic(() => import("./e-brochure/Flipbook"), { ssr: false });
const PagedView = dynamic(() => import("./e-brochure/PagedView"), { ssr: false });

type Props = { fileUrl: string };

/** What useTranslations("eBrochure") returns, narrowed to what is used. */
type Translate = ReturnType<typeof useTranslations<"eBrochure">>;

/** How long to wait before announcing a page change to a screen reader. */
const ANNOUNCE_DELAY_MS = 400;

/*
  How long the box has to hold still before the book is rebuilt at the new
  size.

  Long enough that dragging a window edge — which fires a ResizeObserver
  entry per frame — rebuilds the book once at the end instead of sixty
  times on the way, short enough that letting go feels immediate. Entering
  or leaving fullscreen skips the wait entirely; see `apply` below.
*/
const RESIZE_SETTLE_MS = 90;

/** In-page, the book may take this share of the viewport height, capped. */
const IN_PAGE_HEIGHT_SHARE = 0.8;
const IN_PAGE_HEIGHT_CAP_REM = 46;

const TOOLBAR_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-xs border border-primary/10 bg-white text-primary shadow-card transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40";

/** Zoom buttons must be children of TransformWrapper — useControls needs it. */
function ZoomControls({ t }: { t: Translate }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();

  return (
    <>
      <button
        type="button"
        aria-label={t("zoomOut")}
        onClick={() => zoomOut()}
        className={TOOLBAR_BUTTON}
      >
        <Minus size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t("zoomIn")}
        onClick={() => zoomIn()}
        className={TOOLBAR_BUTTON}
      >
        <Plus size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t("resetView")}
        onClick={() => resetTransform()}
        className={TOOLBAR_BUTTON}
      >
        <RotateCcw size={15} aria-hidden />
      </button>
    </>
  );
}

export default function EBrochureViewer({ fileUrl }: Props) {
  const t = useTranslations("eBrochure");
  const pages = usePdfPages(fileUrl);
  const { status, pageCount } = pages;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [announced, setAnnounced] = useState(1);
  const [isSpread, setIsSpread] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  /*
    Whether the *screen* — not the reading column — is taller than it is
    wide. Read by the fullscreen spread decision below: a portrait phone
    forces one page the way it always has, but a portrait tablet or an
    ordinary landscape monitor now gets the two-page spread a physical
    brochure opens to. Tracked continuously (measure() below sets it on
    every relevant resize) rather than only in fullscreen, so the first
    frame after entering fullscreen already has the right answer instead
    of one committed a render late.
  */
  const [portraitScreen, setPortraitScreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const flipHandle = useRef<FlipbookHandle | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  /** The box currently in effect, and which mode it was measured in. */
  const appliedBoxRef = useRef<{
    box: { width: number; height: number };
    fullscreen: boolean;
  } | null>(null);
  const settleTimerRef = useRef(0);

  /*
    The box the brochure has to fit inside, measured rather than guessed —
    and measured here, once, for whichever engine is drawing.

    Both dimensions, not just the height. The height alone was enough while
    the flipbook still sized itself from the width it found; it does not
    any more, and it should not, because "the width it found" is precisely
    what is unreliable at the moment fullscreen is entered. Handing it a
    box makes the book's size a decision this component makes rather than
    an outcome of when the browser got round to laying the element out.

    Null until the first measurement, which is one commit and no paint.
  */
  const [bookBox, setBookBox] = useState<{ width: number; height: number } | null>(
    null,
  );

  /*
    Reduced motion, read as a live preference rather than once at mount —
    the same matchMedia-into-state shape CompanyIntroGallery uses, including
    the change listener, so toggling it in the OS takes effect immediately.

    It selects a different component rather than a faster flip: StPageFlip
    throws on a flippingTime of 0, and "less motion" means remove it, not
    hurry it.
  */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const useFlipbook = !reducedMotion && status === "ready";

  // Keep the rendered window around wherever the reader is.
  useEffect(() => {
    if (status !== "ready") return;
    pages.ensureWindow(spreadWindow(currentIndex, pageCount, isSpread));
  }, [pages, status, currentIndex, pageCount, isSpread]);

  /*
    Announce the page a reader has landed on, not every page they passed
    through. Holding an arrow key would otherwise machine-gun the screen
    reader with pages nobody is reading. The visible counter is not
    debounced — only the announcement is.
  */
  useEffect(() => {
    const timer = window.setTimeout(
      () => setAnnounced(currentIndex + 1),
      ANNOUNCE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [currentIndex]);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), Math.max(pageCount - 1, 0));
      setCurrentIndex(clamped);
      flipHandle.current?.turnTo(clamped);
    },
    [pageCount],
  );

  const next = useCallback(() => {
    if (currentIndex >= pageCount - 1) return;

    if (flipHandle.current) {
      flipHandle.current.flipNext();
      // The library advances by a spread; ask it where it landed rather
      // than assuming, on the next tick when it knows.
      setCurrentIndex((index) => Math.min(index + (isSpread ? 2 : 1), pageCount - 1));
      return;
    }

    setCurrentIndex((index) => Math.min(index + 1, pageCount - 1));
  }, [currentIndex, pageCount, isSpread]);

  const previous = useCallback(() => {
    if (currentIndex <= 0) return;

    if (flipHandle.current) {
      flipHandle.current.flipPrev();
      setCurrentIndex((index) => Math.max(index - (isSpread ? 2 : 1), 0));
      return;
    }

    setCurrentIndex((index) => Math.max(index - 1, 0));
  }, [currentIndex, isSpread]);

  // Native fullscreen, the same call SitePlanMap makes.
  const toggleFullscreen = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;

    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.();
  }, []);

  /*
    Track fullscreen from the browser, not from our own click. A visitor
    can leave with the browser's own Escape or F11, and a button still
    labelled "exit full screen" after that is a lie to a screen reader.

    Focus is returned to the button on exit for the same reason the mobile
    menu does it — otherwise focus is left on the document body and the
    next Tab starts from the top of the page. While fullscreen is active
    the browser scopes sequential focus to the fullscreen element itself,
    so no manual focus trap is needed here.
  */
  useEffect(() => {
    const onChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) fullscreenButtonRef.current?.focus();

      /*
        Whatever pan/zoom the reader was mid-gesture on does not survive
        the jump to a screen of a different size — a leftover translate
        computed for the small in-page book would otherwise read as the
        book itself sitting off-centre in the new, bigger one. `0` for no
        animation: the frame is already changing size on its own, and
        animating the reset on top of that fights it rather than settling
        into it.
      */
      transformRef.current?.resetTransform(0);
    };

    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /*
    Measure the space the book has, and re-measure whenever any side of
    that sum moves — entering or leaving fullscreen, rotating the device,
    dragging the window, or opening the thumbnail strip, which is part of
    the same column and has to fit too.

    In fullscreen the height is what the toolbar leaves over, which is a
    measurement and not something CSS can hand to a max-width.
    `calc(100dvh - 13rem)` was the first cut, and 13rem is a guess that is
    wrong in both directions: too generous on a phone held upright, where
    the reserve is dead space the book could have used, and far too
    generous on a phone held sideways, where 208px of a 375px screen left
    the brochure a postage stamp in the middle of the display.

    The toolbar's own top margin is inside `offsetHeight` here because a
    flex item establishes a block formatting context, so it is not added
    twice.

    In the page the height is a share of the viewport instead — the same
    `min(80dvh, 46rem)` the stylesheet used to express — because there the
    container's height is decided *by* the book, and measuring it to size
    the book is a loop. Its width still is not, so that half is measured in
    both modes.
  */
  useEffect(() => {
    const container = containerRef.current;
    const chrome = chromeRef.current;
    if (!container || !chrome) return;

    const apply = (next: { width: number; height: number }) => {
      const applied = appliedBoxRef.current;
      /*
        A mode change is applied on the spot. Everything else waits for the
        box to hold still, so that a drag rebuilds the book once rather
        than once a frame — but a reader who just pressed the fullscreen
        button is watching, and 90ms of the old size inside the new screen
        is exactly the flicker this is meant to avoid.
      */
      const modeChanged = !applied || applied.fullscreen !== isFullscreen;

      if (
        applied &&
        !modeChanged &&
        Math.abs(applied.box.width - next.width) < 2 &&
        Math.abs(applied.box.height - next.height) < 2
      ) {
        return;
      }

      window.clearTimeout(settleTimerRef.current);

      const commit = () => {
        appliedBoxRef.current = { box: next, fullscreen: isFullscreen };
        setBookBox(next);
      };

      if (modeChanged) commit();
      else settleTimerRef.current = window.setTimeout(commit, RESIZE_SETTLE_MS);
    };

    const measure = () => {
      // Cheap, and read by the fullscreen spread decision — see
      // portraitScreen's own comment for why this runs unconditionally
      // rather than only while isFullscreen is true.
      setPortraitScreen(window.innerWidth < window.innerHeight);

      const styles = window.getComputedStyle(container);
      const padX =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const padY =
        parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

      const rootSize =
        parseFloat(window.getComputedStyle(document.documentElement).fontSize) ||
        16;

      /*
        In fullscreen the screen is the box, and it is read from the window
        rather than from the element. The two agree — the stylesheet gives
        the shell the viewport's own dimensions — but only one of them is
        immune to what the shell is holding: `clientWidth` drops by the
        width of a scrollbar the moment the content is a pixel too tall,
        which would narrow the book, which would shorten it, which would
        take the scrollbar away again. Sizing a box from a measurement its
        own contents can change is how a layout ends up oscillating once a
        second forever.

        Floors rather than raw values: a toolbar that wrapped onto three
        rows on a very short screen would otherwise leave nothing at all,
        and rounding down means a book can never round its way past the box
        and put that scrollbar there in the first place.
      */
      apply({
        width: Math.max(
          Math.floor((isFullscreen ? window.innerWidth : container.clientWidth) - padX),
          120,
        ),
        height: isFullscreen
          ? Math.max(
              Math.floor(window.innerHeight - padY - chrome.offsetHeight),
              200,
            )
          : Math.floor(
              Math.min(
                window.innerHeight * IN_PAGE_HEIGHT_SHARE,
                IN_PAGE_HEIGHT_CAP_REM * rootSize,
              ),
            ),
      });
    };

    measure();

    /*
      The synchronous read above is right for a CSS-driven resize (this
      effect firing because `status` or `showThumbnails` changed), but
      entering fullscreen is a browser-driven one, and the two macOS
      browsers this was tested against do not agree on when the tab's
      layout box actually catches up to the new screen: `fullscreenchange`
      has fired and `container.clientHeight` has already jumped to the full
      screen's height, while the element the book sits in is still laid out
      at its in-page width. A burst of measurements across the next several
      frames — most of them redundant, one of them the frame that actually
      matters — costs nothing a reader can perceive and removes the
      dependence on guessing which frame is the right one.
    */
    const burst: number[] = [];
    if (isFullscreen) {
      let framesLeft = 8;
      const step = () => {
        measure();
        framesLeft -= 1;
        if (framesLeft > 0) burst.push(requestAnimationFrame(step));
      };
      burst.push(requestAnimationFrame(step));
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(chrome);

    /*
      And the viewport itself, which the observer above cannot see: in the
      page the height comes from `window.innerHeight`, and a phone hiding
      its address bar changes that without changing the width of anything.
    */
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(settleTimerRef.current);
      burst.forEach((id) => cancelAnimationFrame(id));
    };
  }, [isFullscreen, status, showThumbnails]);

  /*
    Keyboard, bound only while the viewer has something to show — the rest
    of the page keeps its own arrow-key behaviour otherwise. Same scoping
    as the gallery lightbox.
  */
  useEffect(() => {
    if (status !== "ready") return;

    function onKeyDown(event: KeyboardEvent) {
      // Never steal a keystroke from a form control.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          previous();
          break;
        case "Home":
          goTo(0);
          break;
        case "End":
          goTo(pageCount - 1);
          break;
        case "Escape":
          if (showThumbnails) setShowThumbnails(false);
          break;
        default:
          return;
      }

      event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, next, previous, goTo, pageCount, showThumbnails]);

  const pageLabel = useCallback(
    (index: number) => t("goToPage", { page: index + 1 }),
    [t],
  );

  const thumbnailIndices = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index),
    [pageCount],
  );

  const downloadLink = (
    <a
      href={fileUrl}
      download
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xs border border-primary/15 bg-white px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
    >
      <FileDown size={16} aria-hidden />
      {t("download")}
    </a>
  );

  if (status === "error") {
    return (
      <div className="rounded-xs border border-red-200 bg-red-50/60 p-8 text-center">
        <AlertCircle size={24} className="mx-auto text-red-700" aria-hidden />
        <p className="mt-4 text-sm font-medium text-ink">{t("loadFailed")}</p>
        <p className="mt-1.5 text-sm text-ink/70">{t("loadFailedHint")}</p>
        <div className="mt-6 flex justify-center">{downloadLink}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      /*
        In fullscreen the browser hands this element the whole screen, and
        normal flow leaves the brochure pinned to the top with the toolbar
        stranded below it. Centring both ways is the only thing that reads
        as "full screen" rather than "the page, but bigger".

        The opaque background matters too: the class below is translucent,
        and fullscreen paints black behind it.
      */
      className={
        isFullscreen
          ? "brochure-shell flex h-full w-full flex-col items-center justify-center overflow-auto bg-surface p-3 sm:p-5"
          : "brochure-shell bg-surface-muted/40 p-3 sm:p-5"
      }
      style={{
        /*
          How tall the brochure itself may be. PagedView caps its width
          against this; the flipbook is handed the same number as a prop,
          because it needs both dimensions as real numbers rather than as
          a constraint it resolves later.

          The CSS expressions are the fallback for the one commit before
          the first measurement lands, and they are what a page with the
          stylesheet but no JS-measured box would still get right.
        */
        ["--brochure-max-height" as string]: bookBox
          ? `${bookBox.height}px`
          : isFullscreen
            ? "calc(100dvh - 13rem)"
            : "min(80dvh, 46rem)",
      }}
    >
      {status === "loading" ? (
        <>
          <div
            className="skeleton-shimmer mx-auto w-full max-w-3xl rounded-xs"
            style={{ aspectRatio: pages.aspectRatio }}
            role="status"
            aria-label={t("loading")}
          />
          {/*
            The download is offered while the brochure is still arriving,
            not only once it has. This is the state that lasts longest for
            the visitor it matters most to — someone on a slow connection
            waiting on a large file — and hiding the escape hatch behind
            the spinner is exactly backwards.
          */}
          <div className="mt-4 flex justify-center">{downloadLink}</div>
        </>
      ) : (
        <TransformWrapper
          ref={transformRef}
          minScale={1}
          maxScale={4}
          doubleClick={{ disabled: false }}
          /*
            No drag at rest. react-zoom-pan-pinch pans on a plain click-drag
            by default even at scale 1, which does nothing useful when the
            book already fits its box — there is nothing to reveal by
            sliding it — and reads as the whole page being loose. It also
            competes with StPageFlip's own drag-to-turn gesture on the book
            itself.

            Gated on `zoomed` rather than off permanently: once a reader has
            zoomed in, that same drag is how they pan around the enlarged
            page, and that is a real behaviour to keep.
          */
          panning={{ disabled: !zoomed }}
          // 1.01 rather than 1: the library lands a reset a hair off exact
          // unity, and a strict > 1 would leave the book un-flippable after
          // zooming back out.
          onTransform={(_ref, state) => setZoomed(state.scale > 1.01)}
        >
          <>
            <TransformComponent
              wrapperClass="w-full!"
              contentClass="w-full!"
            >
              {useFlipbook ? (
                <Flipbook
                  pages={pages}
                  onIndexChange={setCurrentIndex}
                  onOrientationChange={(orientation) =>
                    setIsSpread(orientation === "landscape")
                  }
                  // Zoomed in, the pointer pans instead of turning pages.
                  interactive={!zoomed}
                  /*
                    Single page in fullscreen only on a portrait screen — a
                    phone held upright, where a spread of two landscape
                    pages would be squeezed to a fraction of the screen's
                    height (see portraitScreen's comment above). On an
                    ordinary landscape monitor, fullscreen now opens to a
                    two-page spread, the way a printed brochure does and
                    the way a reader asked for it — the box-fitting math
                    below already sizes a spread correctly; only single
                    page ever forced it to one.
                  */
                  forceSinglePage={isFullscreen && portraitScreen}
                  box={bookBox}
                  // So a rebuild at a new size reopens on the page being
                  // read rather than on the cover.
                  currentIndex={currentIndex}
                  pageLabel={pageLabel}
                  handleRef={flipHandle}
                />
              ) : (
                <PagedView
                  pages={pages}
                  currentIndex={currentIndex}
                  pageLabel={pageLabel}
                />
              )}
            </TransformComponent>

            <div ref={chromeRef} className="w-full">
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label={t("firstPage")}
                  onClick={() => goTo(0)}
                  disabled={currentIndex === 0}
                  className={TOOLBAR_BUTTON}
                >
                  <ChevronsLeft size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("previousPage")}
                  onClick={previous}
                  disabled={currentIndex === 0}
                  className={TOOLBAR_BUTTON}
                >
                  <ChevronLeft size={16} aria-hidden />
                </button>

                <p
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="min-w-36 text-center text-sm tabular-nums text-ink/70"
                >
                  {t("pageOf", { current: announced, total: pageCount })}
                </p>

                <button
                  type="button"
                  aria-label={t("nextPage")}
                  onClick={next}
                  disabled={currentIndex >= pageCount - 1}
                  className={TOOLBAR_BUTTON}
                >
                  <ChevronRight size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("lastPage")}
                  onClick={() => goTo(pageCount - 1)}
                  disabled={currentIndex >= pageCount - 1}
                  className={TOOLBAR_BUTTON}
                >
                  <ChevronsRight size={16} aria-hidden />
                </button>

                <span className="mx-1 h-6 w-px bg-primary/10" aria-hidden />

                <ZoomControls t={t} />

                <button
                  type="button"
                  aria-label={showThumbnails ? t("hideThumbnails") : t("thumbnails")}
                  aria-expanded={showThumbnails}
                  onClick={() => setShowThumbnails((open) => !open)}
                  className={TOOLBAR_BUTTON}
                >
                  <LayoutGrid size={15} aria-hidden />
                </button>

                <button
                  ref={fullscreenButtonRef}
                  type="button"
                  aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
                  onClick={toggleFullscreen}
                  className={TOOLBAR_BUTTON}
                >
                  {isFullscreen ? (
                    <Minimize size={15} aria-hidden />
                  ) : (
                    <Maximize size={15} aria-hidden />
                  )}
                </button>

                <span className="mx-1 h-6 w-px bg-primary/10" aria-hidden />

                {downloadLink}
              </div>

              {showThumbnails && (
                <nav
                  aria-label={t("thumbnails")}
                  className="mt-4 flex gap-2 overflow-x-auto pb-2"
                >
                  {thumbnailIndices.map((index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={t("goToPage", { page: index + 1 })}
                      aria-current={index === currentIndex}
                      onClick={() => goTo(index)}
                      className={`flex h-16 w-12 shrink-0 items-center justify-center rounded-xs border text-xs tabular-nums transition-colors ${
                        index === currentIndex
                          ? "border-accent-700 bg-accent/10 text-accent-800"
                          : "border-primary/10 bg-white text-ink-muted hover:bg-primary/5"
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          </>
        </TransformWrapper>
      )}
    </div>
  );
}
