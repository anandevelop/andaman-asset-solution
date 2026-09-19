/**
 * e2e/e-brochure.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The flipbook, end to end: a real PDF fetched by a real pdf.js worker and
 * rasterised in a real browser. Nothing below this line is mocked except
 * the network response carrying the file.
 *
 * That one stub is what makes the interesting cases reachable. A brochure
 * that never arrives is the single most likely thing to go wrong in
 * production — a 50MB file on hotel wifi, a bucket whose CORS rule was
 * typed by hand — and `route.abort()` is the only way to produce it on
 * demand. The assertion that matters there is not that an error appears,
 * but that the download link is still one click away.
 *
 * Note that playwright.config.ts sets `reducedMotion: "reduce"` for the
 * whole suite, so by default these specs exercise PagedView, not the
 * flipbook. That is the right default — it is stable and it is what a
 * meaningful share of visitors get — and the flip has its own block below
 * that opts back in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Page } from "@playwright/test";
import { expect, test } from "./harness";
import { expectNoA11yViolations } from "./a11y";
import { DRAFT_BROCHURE, E_BROCHURE } from "./fixtures";
import { buildSamplePdf, SAMPLE_PDF_PAGE_COUNT } from "./fixtures/sample-pdf";

const PDF = buildSamplePdf();
const LANDSCAPE_PDF = buildSamplePdf({ landscape: true });

/** Serve the fixture PDF, with the headers a real object store sends. */
async function serveBrochure(page: Page, body: Buffer = PDF) {
  await page.route(`**${E_BROCHURE.fileUrl}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: {
        "accept-ranges": "bytes",
        "content-length": String(body.length),
      },
      body,
    }),
  );
}

/**
 * Wait until StPageFlip has drawn the book.
 *
 * It positions and sizes its pages on its own animation frame, so for a
 * frame after the book is built — or rebuilt, which is what a new size
 * does — the leaves are in the DOM with a zero-width box. Nothing is
 * visible to a reader in that gap; the browser is mid fullscreen
 * transition and has not painted either. But a test that reads the layout
 * the instant a label changes lands inside it, and measures the gap
 * between two frames rather than anything about the product.
 */
async function waitForBookDrawn(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const leaf = document.querySelector(".stf__block")?.firstElementChild;
        return leaf ? Math.round(leaf.getBoundingClientRect().width) : 0;
      }),
    )
    .toBeGreaterThan(0);
}

/** The viewer has finished when the first page bitmap is on screen. */
async function waitForFirstPage(page: Page) {
  await expect(page.getByRole("status")).toContainText(
    String(SAMPLE_PDF_PAGE_COUNT),
    { timeout: 30_000 },
  );
}

test.describe("Brochure index", () => {
  test("lists the published brochure and links to its viewer", async ({ page }) => {
    await page.goto("/en/e-brochure");

    const link = page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(E_BROCHURE.title.en, "i") });

    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      "href",
      `/en/e-brochure/${E_BROCHURE.slug}`,
    );
  });

  test("does not list an unpublished brochure", async ({ page }) => {
    // The listing counts visible cards; without a draft in the fixture set
    // a query that quietly started returning them would still pass.
    await page.goto("/en/e-brochure");

    await expect(
      page.getByRole("main").getByText(DRAFT_BROCHURE.title),
    ).toHaveCount(0);
  });

  test("does not serve an unpublished brochure asked for by slug", async ({ page }) => {
    /*
      Asserted on the rendered page, not on the status code.

      Every detail route in this app answers an unknown slug with the
      not-found page and an HTTP 200 — news, projects and events all
      behave the same way, which was measured rather than assumed. It is a
      soft 404, and it is a site-wide SEO question that predates this
      feature; changing it here alone would be inconsistent and out of
      scope. What matters for the draft brochure is that its content does
      not reach a visitor who guesses the URL, and that is what this
      checks.
    */
    await page.goto(`/en/e-brochure/${DRAFT_BROCHURE.slug}`);

    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByText(DRAFT_BROCHURE.title)).toHaveCount(0);
  });

  test("shows the brochure in the visitor's language", async ({ page }) => {
    await page.goto("/th/e-brochure");

    await expect(
      page.getByRole("main").getByText(E_BROCHURE.title.th),
    ).toBeVisible();
  });
});

test.describe("Viewer", () => {
  test.beforeEach(async ({ page }) => {
    await serveBrochure(page);
  });

  test("renders the brochure and reports its length", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    await expect(page.getByRole("status")).toContainText("Page 1");
    await expect(page.getByRole("img").first()).toBeVisible();
  });

  test("moves through the brochure with the toolbar", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("status")).toContainText("Page 2");

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page.getByRole("status")).toContainText("Page 1");
  });

  test("moves through the brochure with the arrow keys", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toContainText("Page 2");

    await page.keyboard.press("End");
    await expect(page.getByRole("status")).toContainText(
      `Page ${SAMPLE_PDF_PAGE_COUNT}`,
    );

    await page.keyboard.press("Home");
    await expect(page.getByRole("status")).toContainText("Page 1");
  });

  test("stops at the covers rather than wrapping", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    // Page one has no previous page; the control has to say so rather than
    // silently jumping to the back cover.
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await page.keyboard.press("End");
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  test("jumps to a page from the thumbnail strip", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    await page.getByRole("button", { name: "Pages", exact: true }).click();

    const thumbnails = page.getByRole("navigation", { name: "Pages" });
    await thumbnails.getByRole("button", { name: "Go to page 3" }).click();

    await expect(page.getByRole("status")).toContainText("Page 3");
    await expect(
      thumbnails.getByRole("button", { name: "Go to page 3" }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("keeps the download link reachable while reading", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    const download = page.getByRole("link", { name: "Download PDF" }).first();

    await expect(download).toHaveAttribute("href", E_BROCHURE.fileUrl);
    await expect(download).toHaveAttribute("download", "");
  });

  test("names every toolbar control for a screen reader", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    // Icon-only buttons: if any of these loses its aria-label the control
    // becomes unreachable to a screen reader while looking fine.
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
      await expect(
        page.getByRole("button", { name, exact: true }),
        `toolbar control "${name}"`,
      ).toBeVisible();
    }
  });

  test("has no automatically detectable violations while open", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    // Scanned with the viewer settled, not on the skeleton — a scan that
    // lands mid-fade reads a real colour at reduced opacity and reports a
    // contrast failure that does not exist (see e2e/a11y.ts).
    await expectNoA11yViolations(page);
  });

  test("has no violations with the thumbnail drawer open", async ({ page }) => {
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Pages" })).toBeVisible();

    await expectNoA11yViolations(page);
  });
});

test.describe("When the brochure cannot be fetched", () => {
  test("says so, and still offers the download", async ({ page }) => {
    // The case a 50MB brochure on a bad connection actually hits. The
    // error state is worth little on its own; the download link beside it
    // is the whole point.
    await page.route(`**${E_BROCHURE.fileUrl}`, (route) => route.abort());

    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);

    await expect(
      page.getByText("This brochure could not be displayed."),
    ).toBeVisible({ timeout: 30_000 });

    const download = page.getByRole("link", { name: "Download PDF" }).first();
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute("href", E_BROCHURE.fileUrl);
  });
});

test.describe("Flipbook", () => {
  // Opts out of the suite-wide reducedMotion: "reduce", which otherwise
  // renders PagedView and never loads page-flip at all.
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("renders the page-flip book and turns a page", async ({ page }) => {
    await serveBrochure(page);
    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    // StPageFlip wraps the pages it is given in its own markup; this class
    // appearing is proof the library initialised rather than silently
    // falling back.
    await expect(page.locator(".stf__parent")).toBeVisible();

    // Desktop Chrome's viewport is well above the 767px breakpoint
    // Flipbook.tsx uses for single-page mode, so this opens in a two-page
    // spread — EBrochureViewer.tsx's next()/previous() deliberately step
    // by 2 pages in that mode, not 1, to advance a whole spread at a time.
    // "Page 3", not "Page 2", is what one Next click actually produces
    // here.
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("status")).toContainText("Page 3");
  });
});

test.describe("On a phone", () => {
  /*
    The flipbook, not PagedView — the suite asks for reduced motion
    globally, and the layout being tested here is the flipbook's.
  */
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  /** Width of the leaf actually on screen, and of the book that holds it. */
  async function measure(page: Page) {
    return page.evaluate(() => {
      const block = document.querySelector(".stf__block");
      const leaf = block?.firstElementChild as HTMLElement | undefined;

      return {
        book: block?.clientWidth ?? 0,
        leaf: leaf ? Math.round(leaf.getBoundingClientRect().width) : 0,
        scrollWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      };
    });
  }

  /*
    Two widths, because they fail differently.

    430 is an ordinary phone. 700 is a large phone in landscape, a small
    window, or — the case that actually prompted this — the viewer in
    fullscreen, where the book is handed the whole screen instead of a
    padded column. The library's own rule collapses to one page only below
    roughly 400px of book width, so 700 is where it used to serve a spread
    and 430 is where it happened not to. A test that only covered 430 would
    have passed against the bug.
  */
  for (const [shape, body] of [
    ["a portrait brochure", PDF],
    // The shape that prompted this: a sale kit exported landscape. Two
    // landscape pages side by side is a 2.8:1 strip — unreadable on a
    // phone however much width it thinks it has.
    ["a landscape brochure", LANDSCAPE_PDF],
  ] as const) {
  for (const width of [430, 700]) {
    test(`shows one page at a time for ${shape} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 932 });
      await serveBrochure(page, body);

      await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
      await waitForFirstPage(page);
      await expect(page.locator(".stf__parent")).toBeVisible();

      const { book, leaf, scrollWidth, viewport } = await measure(page);

      /*
        One page fills the book; a spread would make each leaf half of it.
        Asserted as a ratio rather than a pixel count so the test does not
        break the next time the container padding changes.
      */
      expect(leaf / book).toBeGreaterThan(0.9);

      // And the fix must not buy the single page with a horizontal
      // scrollbar — the library sets its own min-width from the same
      // setting that decides the orientation.
      expect(scrollWidth).toBeLessThanOrEqual(viewport);
    });
  }
  }

  test("still shows a spread on a desktop viewport", async ({ page }) => {
    // The other half of the contract: the breakpoint has to actually be a
    // breakpoint, not a permanent downgrade to single page.
    await page.setViewportSize({ width: 1280, height: 800 });
    await serveBrochure(page);

    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);
    await expect(page.locator(".stf__parent")).toBeVisible();

    const { book, leaf } = await measure(page);

    expect(leaf / book).toBeLessThan(0.6);
  });
});

test.describe("Fullscreen", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  /*
    Fullscreen is the one layout the browser, not the page, controls the
    size of — and normal flow leaves the brochure pinned to the top with
    the toolbar stranded somewhere below it. On a wide screen it was worse
    than untidy: StPageFlip sized the book from the width alone (its own
    height clamp reads back a value it wrote itself, and its maxHeight
    setting is ignored in stretch mode), so the book came out 1103px tall
    inside a 900px viewport and the controls fell off the bottom.

    Asserted as symmetry rather than as pixel positions, so the test says
    "centred" rather than "matches the layout on the day it was written".
  */
  for (const [label, width, height, spread] of [
    // Landscape screen: opens to a two-page spread, the way a printed
    // brochure does — see the "spread" describe block below for why.
    ["desktop", 1600, 900, true],
    // Portrait screen: a spread would be squeezed into a fraction of the
    // height, so fullscreen still forces one page here.
    ["iPad", 820, 1180, false],
    ["phone", 430, 932, false],
  ] as const) {
    test(`centres the brochure on ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await serveBrochure(page);

      await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
      await waitForFirstPage(page);

      await page.getByRole("button", { name: "Full screen" }).click();
      await expect(
        page.getByRole("button", { name: "Exit full screen" }),
      ).toBeVisible();
      await waitForBookDrawn(page);

      const box = await page.evaluate(() => {
        const screen = document.fullscreenElement as HTMLElement;
        const book = document.querySelector(".stf__parent")!.getBoundingClientRect();
        const toolbar = document
          .querySelector("a[download]")!
          .closest("div")!
          .getBoundingClientRect();

        /*
          The leaf, not just the frame around it. `.stf__parent` is a
          plain block that centres itself with margins whatever the
          library does inside it, so measuring only that answers "is the
          box centred", which was true even when the brochure was visibly
          off to one side. The pages are positioned by StPageFlip from a
          width it measured earlier, and that is the number that goes
          wrong.
        */
        const block = document.querySelector(".stf__block")!;
        const leaf = block.firstElementChild as HTMLElement;

        return {
          screenW: window.innerWidth,
          screenH: window.innerHeight,
          left: book.left,
          right: window.innerWidth - book.right,
          top: book.top,
          below: window.innerHeight - toolbar.bottom,
          toolbarBottom: toolbar.bottom,
          overflows: screen.scrollHeight > screen.clientHeight,
          blockWidth: block.clientWidth,
          bookHeight: book.height,
          leafWidth: leaf.getBoundingClientRect().width,
        };
      });

      // Equal margins either side, and equal space above the brochure and
      // below the toolbar — the whole group centred, not just the book.
      expect(Math.abs(box.left - box.right)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.top - box.below)).toBeLessThanOrEqual(2);

      /*
        And the pages have to have grown into the screen they were just
        handed. StPageFlip only re-measures on a window resize, which
        fires while the element is still laid out at its in-page width —
        so without a re-measure the book keeps its old page size and,
        because its left edge is derived from the old container's
        midpoint, sits flush against the left of the new one. A leaf that
        is not its expected share of the book is that bug.

        The share itself depends on orientation — see the array above.
        Portrait screens still force a single page (a spread would be
        squeezed into a fraction of the height), so the leaf is the whole
        block there; a landscape screen now opens to a spread instead, so
        the leaf is one of two, not the whole block.
      */
      if (spread) {
        expect(box.leafWidth / box.blockWidth).toBeGreaterThan(0.45);
        expect(box.leafWidth / box.blockWidth).toBeLessThan(0.55);
      } else {
        expect(box.leafWidth / box.blockWidth).toBeGreaterThan(0.95);
        expect(box.leafWidth / box.blockWidth).toBeLessThan(1.02);
      }

      /*
        And it has to actually fill. Whichever dimension binds — height on
        a wide screen, width on a phone holding a landscape page — should
        be all but used up. This is what fails if the height reserved for
        the toolbar is ever over-estimated again.
      */
      const filled = Math.max(
        (100 * box.blockWidth) / box.screenW,
        (100 * box.bookHeight) / box.screenH,
      );
      expect(filled).toBeGreaterThan(88);

      // And it has to fit. The controls being on screen is the difference
      // between a fullscreen reader and a trap.
      expect(box.toolbarBottom).toBeLessThanOrEqual(box.screenH);
      expect(box.overflows).toBe(false);
    });
  }
});

test.describe("Fullscreen, landscape brochure", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  /*
    The shape the block above does not cover, and the one that was actually
    reported: an A4 landscape sale kit, fullscreen, on a desktop display.

    The original bug here was the book sizing itself from its width alone
    (stretch mode ignoring the height entirely) and landing on a *wrong*
    687x486 page — undersized by its own logic, not merely letterboxed.
    Forcing a single page fixed that by giving every screen a 1.41:1
    object instead of a 2.83:1 one, which is what the first fix in this
    file did.

    A reader then asked for the two-page spread back on an ordinary
    landscape monitor — see the "spread" cases below — and a spread really
    is 2.83:1 no matter how well it's fitted: on a 1.34:1 screen like
    1414x1058, correctly *width*-bound sizing still lands on 687x486 per
    page, the same numbers the bug produced. The two are not the same
    thing even though the pixels coincide here — one is the deliberate,
    correctly-computed shape of a wide object in a narrower frame; the
    other was the wrong shape entirely — but it means letterboxing above
    and below a landscape spread is the expected, correct output on a
    screen that isn't itself very wide, not a regression to chase away.

    The sizes are the ones the original report named, plus a portrait
    display, where the binding dimension flips to the width and a spread
    would be squeezed thin — fullscreen still forces a single page there.
  */
  for (const [width, height, spread] of [
    [1280, 720, true],
    [1414, 1058, true],
    [1920, 1080, true],
    [2560, 1440, true],
    [900, 1400, false],
  ] as const) {
    test(`fills the screen at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await serveBrochure(page, LANDSCAPE_PDF);

      await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
      await waitForFirstPage(page);

      await page.getByRole("button", { name: "Full screen" }).click();
      await expect(
        page.getByRole("button", { name: "Exit full screen" }),
      ).toBeVisible();
      await waitForBookDrawn(page);

      const box = await page.evaluate(() => {
        const shell = document.fullscreenElement as HTMLElement;
        const book = document.querySelector(".stf__parent")!.getBoundingClientRect();
        const block = document.querySelector(".stf__block")!;
        const leaf = block.firstElementChild as HTMLElement;
        /*
          The whole chrome, not the row of controls: the toolbar carries a
          16px top margin that is part of what the screen is spending and
          is outside the row's own box. Measuring the row alone reports
          16px of slack that is not slack.
        */
        const chrome = document.querySelector("a[download]")!.closest("div")!
          .parentElement as HTMLElement;
        const toolbar = chrome.getBoundingClientRect();

        const styles = getComputedStyle(shell);

        return {
          screenW: window.innerWidth,
          screenH: window.innerHeight,
          bookW: book.width,
          bookH: book.height,
          blockWidth: block.clientWidth,
          leafWidth: leaf.getBoundingClientRect().width,
          toolbarH: toolbar.height,
          toolbarBottom: toolbar.bottom,
          paddingY:
            parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom),
          paddingX:
            parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight),
          overflows: shell.scrollHeight > shell.clientHeight,
          scrolls: shell.scrollWidth > shell.clientWidth,
        };
      });

      // A spread on a landscape screen (a leaf is one of two), a single
      // page on a portrait one (a leaf is the whole book) — see the
      // `spread` column above.
      if (spread) {
        expect(box.leafWidth / box.blockWidth).toBeGreaterThan(0.45);
        expect(box.leafWidth / box.blockWidth).toBeLessThan(0.55);
      } else {
        expect(box.leafWidth / box.blockWidth).toBeGreaterThan(0.95);
        expect(box.leafWidth / box.blockWidth).toBeLessThan(1.02);
      }

      /*
        The assertion the bug was: the brochure gets everything the screen
        is not spending on the toolbar or its own padding, in whichever
        direction runs out first.

        Stated as the leftover rather than as a share of the screen,
        because the share is a different number at 720p — where the toolbar
        is 110px of 720 — than at 1440, while the thing that went wrong is
        the same at both: a band of empty background the book could have
        filled. The reported case left ~500px of it.

        The other direction is expected to have slack, and on a portrait
        screen it is most of the screen: a landscape page that is as wide
        as the display can be is still only 70% as tall. Requiring both to
        be tight would be requiring a page shape no A4 sheet has.
      */
      const slack = Math.min(
        box.screenH - box.paddingY - box.toolbarH - box.bookH,
        box.screenW - box.paddingX - box.bookW,
      );
      expect(slack, "unused space in the binding direction").toBeLessThanOrEqual(10);

      /*
        And whichever dimension is doing the binding should be nearly
        maxed out. A spread (2.83:1) is wider than every screen in this
        list, so it is always width-bound here, same as a single page on
        a portrait screen — a landscape page there cannot be taller than
        the screen is wide, divided by 1.41. The remaining combination,
        a single page on a landscape screen, is height-bound instead
        (its 1.41:1 is close enough to an ordinary screen's own ratio);
        nothing in this file's five cases reaches it, but a future one
        might, so the branch is still here rather than assumed away.
      */
      if (spread || box.screenW < box.screenH) {
        expect((100 * box.bookW) / box.screenW).toBeGreaterThan(90);
      } else {
        expect((100 * box.bookH) / box.screenH).toBeGreaterThan(90);
      }

      // Neither scrollbar, and the controls still on screen.
      expect(box.overflows).toBe(false);
      expect(box.scrolls).toBe(false);
      expect(box.toolbarBottom).toBeLessThanOrEqual(box.screenH);
    });
  }

  test("goes back to a spread when the browser leaves fullscreen", async ({
    page,
  }) => {
    /*
      Left through the browser rather than through our button — the Escape
      key, or F11 — which is the case a viewer that tracks its own clicks
      instead of subscribing to `fullscreenchange` gets wrong: the layout
      stays in its fullscreen shape inside a window that is no longer
      fullscreen.

      Driven with exitFullscreen() rather than a keypress because Escape is
      handled by browser chrome that Playwright's synthetic key events do
      not reach; both arrive at the page as the same event, which is the
      part being tested.

      A portrait viewport, deliberately — a landscape one now opens to a
      spread both in the page and in fullscreen (see the `spread` column
      above), so leaving fullscreen would not visibly change anything and
      the test would pass without exercising the listener it exists to
      check. Portrait is still the one shape where fullscreen changes the
      layout: single page there (a spread would be squeezed thin), a
      spread in the ordinary in-page view, which is driven by a different,
      unrelated width breakpoint (Flipbook.tsx's `narrow`) that portrait's
      900px is well above.
    */
    await page.setViewportSize({ width: 900, height: 1400 });
    await serveBrochure(page, LANDSCAPE_PDF);

    await page.goto(`/en/e-brochure/${E_BROCHURE.slug}`);
    await waitForFirstPage(page);

    /*
      NaN, not a thrown error, while the book is between builds.

      A size change tears the old book down and builds a new one — see the
      note above `pageWidth`/`pageHeight` in the effect's dependency array
      in Flipbook.tsx — and for a moment in between, `.stf__block` is not
      in the DOM at all. `expect.poll` retries on a failed *assertion*, not
      on an exception the polled function threw, so reading it with a `!`
      turned that ordinary in-between moment into a hard failure. NaN
      fails every comparison below the same way a missing element would,
      but as a value the poll can retry past rather than an exception that
      ends it.
    */
    const spreadRatio = () =>
      page.evaluate(() => {
        const block = document.querySelector(".stf__block");
        const leaf = block?.firstElementChild as HTMLElement | undefined;
        return leaf ? leaf.getBoundingClientRect().width / block!.clientWidth : NaN;
      });

    await expect.poll(spreadRatio).toBeLessThan(0.6);

    await page.getByRole("button", { name: "Full screen" }).click();
    await expect(
      page.getByRole("button", { name: "Exit full screen" }),
    ).toBeVisible();

    /*
      Polled, not read once. A new size rebuilds the book, and StPageFlip
      positions its pages on its own animation frame — so for one frame
      after the label changes the pages exist at zero width. The reader
      does not see it (the browser is mid fullscreen-transition anyway),
      but a test that reads the DOM the instant the label flips does.
    */
    await expect.poll(spreadRatio).toBeGreaterThan(0.95);

    await page.evaluate(() => document.exitFullscreen());

    // The button's label is the state, so waiting on it is waiting for the
    // component to have noticed — not for a fixed number of milliseconds.
    await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
    await expect.poll(spreadRatio).toBeLessThan(0.6);
  });
});
