/**
 * tests/setup.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Runs before every test file, in both environments.
 *
 * The jsdom-only pieces are guarded rather than split into a second setup
 * file: one file is easier to reason about than two that must be kept in
 * the right order, and the guard is a single `typeof window` check.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, expect, vi } from "vitest";

/*
  A connection string that goes nowhere, and is meant to.

  Several modules under test import lib/prisma transitively — a route
  helper, a query helper — and since Prisma 7 that constructs a driver
  adapter at import time, which needs a URL to exist. Nothing here ever
  opens a connection: this suite is pure functions and file reads, and the
  database-backed checks live in e2e/.

  Deliberately not the real DATABASE_URL. If a test ever does reach for the
  database, it should fail on a refused connection to port 1 rather than
  quietly reading — or writing — the development data.
*/
process.env.DATABASE_URL ??= "postgresql://tests:tests@127.0.0.1:1/no-such-database";

if (typeof window !== "undefined") {
  // Loaded dynamically so the node-environment suites do not pull in jsdom
  // matchers they cannot use.
  const matchers = await import("@testing-library/jest-dom/matchers");
  const { cleanup } = await import("@testing-library/react");

  expect.extend(matchers.default ?? matchers);

  // Unmount between tests. Without this, queries match elements left over
  // from a previous test and failures point at the wrong assertion.
  afterEach(() => cleanup());

  /*
    jsdom implements none of these, and all are used by code under test:
    IntersectionObserver by framer-motion's whileInView (the Reveal
    component wraps most of the site), matchMedia by prefers-reduced-motion
    checks, and ResizeObserver by the e-brochure viewer, which measures the
    box it has to fit a page into. Without stubs the component tree throws
    on mount.

    Both observers are inert rather than simulated. jsdom has no layout
    engine, so there is nothing for either to observe and no callback that
    could carry a meaningful entry — a test that needs real geometry needs
    a real browser, which is what e2e/ is for.
  */
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    /* Part of the interface since the scroll-margin addition to the
       IntersectionObserver spec, and required by the DOM lib TypeScript 7
       ships. Inert like the rest of this stub — jsdom has no layout, so
       there is no margin for it to describe. */
    readonly scrollMargin = "";
    readonly thresholds: readonly number[] = [];
    disconnect() {}
    observe() {}
    unobserve() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  class MockResizeObserver implements ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  /*
    Defined on the window rather than with vi.stubGlobal, which is undone
    by the unstubAllGlobals() below after the *first* test in a file — so
    every test after it in the same file loses the stub and mounts into a
    ReferenceError. ResizeObserver, matchMedia and scrollTo are defined
    this way for the same reason. IntersectionObserver used to be the one
    exception (stubGlobal only), which worked as long as nothing rendered
    a next/link (its prefetch-on-viewport logic is the actual caller) more
    than once per file — components/admin/LanguageTabs.tsx's own test was
    the first to do that and the first to hit it.
  */
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    value: MockIntersectionObserver,
  });

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: MockResizeObserver,
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // jsdom has no layout engine, so scrollTo is a no-op stub rather than an
  // exception.
  Object.defineProperty(window, "scrollTo", { writable: true, value: () => {} });

  // Same reasoning, same no-op: CountrySelect.tsx scrolls its highlighted
  // row into view on arrow-key navigation, and LeadQuickActions.tsx
  // scrolls the composer into view — neither has anything to scroll
  // without a layout engine, but without this stub jsdom throws instead
  // of silently doing nothing.
  Object.defineProperty(window.Element.prototype, "scrollIntoView", {
    writable: true,
    value: () => {},
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
