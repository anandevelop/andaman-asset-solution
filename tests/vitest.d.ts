/**
 * tests/vitest.d.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Teach TypeScript about the jest-dom matchers.
 *
 * `expect.extend` adds them at runtime, which the type system cannot see —
 * so without this every `toBeInTheDocument()` is a compile error while the
 * tests themselves pass. Declaration merging into vitest's `Assertion` is
 * the augmentation jest-dom documents for this.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Assertion<T = any> extends TestingLibraryMatchers<T, void> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, void> {}
}
