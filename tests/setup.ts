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
    jsdom implements neither of these, and both are used by code under
    test: IntersectionObserver by framer-motion's whileInView (the Reveal
    component wraps most of the site), matchMedia by prefers-reduced-motion
    checks. Without stubs the component tree throws on mount.
  */
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    disconnect() {}
    observe() {}
    unobserve() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

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
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
