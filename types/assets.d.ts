/**
 * types/assets.d.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Side-effect imports of stylesheets.
 *
 * `import "../globals.css"` in a layout is how Next is told to include the
 * stylesheet in that route's bundle — the module has no exports and the
 * import exists purely for its effect on the build. TypeScript 5 let that
 * pass unremarked; TypeScript 7 asks for a declaration before it will
 * accept a side-effect import of a non-code file, so here is one.
 *
 * Deliberately untyped (no exported shape): nothing in this codebase
 * imports a CSS module and reads class names off it, and declaring a
 * `{ [key: string]: string }` export would invite exactly that.
 * ─────────────────────────────────────────────────────────────────────────
 */

declare module "*.css";
