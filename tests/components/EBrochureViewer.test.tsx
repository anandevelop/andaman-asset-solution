/**
 * @vitest-environment jsdom
 *
 * Renders React, so it needs a DOM. Vitest 4 removed `environmentMatchGlobs`
 * from vitest.config.ts; the docblock is the replacement, and it has to be
 * the first thing in the file.
 */
/**
 * tests/components/EBrochureViewer.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The viewer's chrome, in the gate.
 *
 * e2e/e-brochure.spec.ts already drives the real thing with a real PDF and
 * a real worker, and it is the better test — but it is not part of
 * `npm run verify`, so a broken aria-label or a lost download link would
 * reach a commit without anyone seeing red. This covers the parts that can
 * be asserted without a browser, and one that is awkward to assert *with*
 * one: the reduced-motion branch, which the e2e suite can only reach by
 * opting out of its own global setting.
 *
 * pdf.js is not mocked here, because it is never reached: the two engines
 * are dynamically imported and are what pull it in, so stubbing them at
 * the module boundary keeps this test about the toolbar.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { flipbookSpy, pagedViewSpy } = vi.hoisted(() => ({
  flipbookSpy: vi.fn(),
  pagedViewSpy: vi.fn(),
}));

vi.mock("@/components/e-brochure/Flipbook", () => ({
  default: (props: unknown) => {
    flipbookSpy(props);
    return <div data-testid="flipbook" />;
  },
}));

vi.mock("@/components/e-brochure/PagedView", () => ({
  default: (props: unknown) => {
    pagedViewSpy(props);
    return <div data-testid="paged-view" />;
  },
}));

/*
  The hook is stubbed rather than the library beneath it. usePdfPages owns
  network, canvas and blob URLs — none of which jsdom has — and its own
  behaviour is covered by tests/pdf-render.ts plus the e2e run.
*/
const { usePdfPagesSpy } = vi.hoisted(() => ({ usePdfPagesSpy: vi.fn() }));

vi.mock("@/components/e-brochure/usePdfPages", () => ({
  usePdfPages: usePdfPagesSpy,
}));

import EBrochureViewer from "@/components/EBrochureViewer";
import { render, screen, waitFor } from "./render";

const READY = {
  status: "ready" as const,
  pageCount: 8,
  aspectRatio: 0.707,
  srcFor: () => undefined,
  ensureWindow: vi.fn(),
};

/** jsdom has no matchMedia; tests/setup.ts stubs it as always false. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  flipbookSpy.mockClear();
  pagedViewSpy.mockClear();
  usePdfPagesSpy.mockReturnValue(READY);
  setReducedMotion(false);
});

const FILE = "https://cdn.example.com/brochures/trinity/abc.pdf";

describe("toolbar", () => {
  it("gives every icon-only control an accessible name", async () => {
    // These buttons have no text. Without an aria-label each one is a
    // blank control to a screen reader while looking perfectly fine.
    render(<EBrochureViewer fileUrl={FILE} />);

    for (const name of [
      "First page",
      "Previous page",
      "Next page",
      "Last page",
      "Zoom in",
      "Zoom out",
      "Reset view",
      "Pages",
      "Full screen",
    ]) {
      expect(
        screen.getByRole("button", { name }),
        `toolbar control "${name}"`,
      ).toBeInTheDocument();
    }
  });

  it("announces the page politely, not assertively", async () => {
    // assertive would interrupt a screen reader on every page turn.
    render(<EBrochureViewer fileUrl={FILE} />);

    const status = screen.getByRole("status");

    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Page 1 of 8");
  });

  it("disables the backward controls on the first page", async () => {
    render(<EBrochureViewer fileUrl={FILE} />);

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });
});

describe("the download link", () => {
  it.each([
    ["while loading", { ...READY, status: "loading" as const, pageCount: 0 }],
    ["once ready", READY],
    ["after a failure", { ...READY, status: "error" as const }],
  ])("is present %s", async (_label, pages) => {
    /*
      The contract this whole component is built around: a visitor who
      cannot read the brochure here is always one click from the file.
      Each of the three states renders a different tree, so each needs
      asserting separately.
    */
    usePdfPagesSpy.mockReturnValue(pages);

    render(<EBrochureViewer fileUrl={FILE} />);

    const link = screen.getByRole("link", { name: /download pdf/i });

    expect(link).toHaveAttribute("href", FILE);
    expect(link).toHaveAttribute("download");
  });
});

describe("failure state", () => {
  it("explains what happened rather than showing an empty frame", async () => {
    usePdfPagesSpy.mockReturnValue({ ...READY, status: "error" as const });

    render(<EBrochureViewer fileUrl={FILE} />);

    expect(
      screen.getByText("This brochure could not be displayed."),
    ).toBeInTheDocument();
  });
});

describe("fullscreen spread", () => {
  /*
    A reader asked fullscreen to open the way a printed brochure does — two
    pages side by side on an ordinary landscape monitor — after the earlier
    fix (single page, always, in fullscreen) turned out to overcorrect: it
    was right for a phone held upright, where a 2.83:1 spread is squeezed
    to a fraction of the screen's height, but wrong for a desktop, where
    the box-fitting math sizes a spread just fine. This is the regression
    test for that overcorrection — see forceSinglePage's comment in
    Flipbook.tsx and portraitScreen's in EBrochureViewer.tsx.

    jsdom has no Fullscreen API, so entering fullscreen is simulated
    directly: define `document.fullscreenElement` and fire the event the
    component's own listener is waiting for, exactly like the browser
    would after element.requestFullscreen() resolves.
  */
  function setWindowSize(width: number, height: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  }

  function enterFullscreen() {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  }

  afterEach(() => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: undefined,
    });
  });

  it("opens to a two-page spread on a landscape screen", async () => {
    setWindowSize(1920, 1080);
    render(<EBrochureViewer fileUrl={FILE} />);

    enterFullscreen();

    await waitFor(() => {
      const lastCall = flipbookSpy.mock.calls.at(-1)?.[0] as { forceSinglePage?: boolean };
      expect(lastCall?.forceSinglePage).toBe(false);
    });
  });

  it("still forces a single page on a portrait screen", async () => {
    setWindowSize(800, 1200);
    render(<EBrochureViewer fileUrl={FILE} />);

    enterFullscreen();

    await waitFor(() => {
      const lastCall = flipbookSpy.mock.calls.at(-1)?.[0] as { forceSinglePage?: boolean };
      expect(lastCall?.forceSinglePage).toBe(true);
    });
  });

  it("never forces a single page outside fullscreen, on any screen", async () => {
    setWindowSize(800, 1200);
    render(<EBrochureViewer fileUrl={FILE} />);

    const lastCall = flipbookSpy.mock.calls.at(-1)?.[0] as { forceSinglePage?: boolean };
    expect(lastCall?.forceSinglePage).toBe(false);
  });
});

describe("reduced motion", () => {
  it("renders the paged reader instead of the flipbook", async () => {
    /*
      The branch the e2e suite cannot reach by default — playwright.config
      sets reducedMotion "reduce" globally, so it is the *flipbook* that
      needs an opt-in there. Here it is the other way round, which means
      both halves end up covered somewhere.

      It has to be a different component, not a faster flip: StPageFlip's
      Settings.getSettings() throws on a flippingTime of 0.
    */
    setReducedMotion(true);

    render(<EBrochureViewer fileUrl={FILE} />);

    expect(await screen.findByTestId("paged-view")).toBeInTheDocument();
    expect(screen.queryByTestId("flipbook")).toBeNull();
  });

  it("renders the flipbook when motion is welcome", async () => {
    setReducedMotion(false);

    render(<EBrochureViewer fileUrl={FILE} />);

    expect(await screen.findByTestId("flipbook")).toBeInTheDocument();
    expect(screen.queryByTestId("paged-view")).toBeNull();
  });
});
