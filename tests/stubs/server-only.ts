/**
 * tests/stubs/server-only.ts
 * ─────────────────────────────────────────────────────────────────────────
 * No-op replacement for the `server-only` package.
 *
 * That package deliberately throws on import outside a React Server
 * Component so a server module can never be bundled into client JavaScript.
 * Correct in the app, fatal in Vitest — which is neither.
 *
 * Aliased in vitest.config.ts. The guard still holds where it matters: the
 * Next.js build resolves the real package.
 * ─────────────────────────────────────────────────────────────────────────
 */

export {};
