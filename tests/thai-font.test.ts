/**
 * tests/thai-font.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * FC Vision is wired by hand: @font-face rules in app/styles/shared.css,
 * files in public/, preload links in two components. Nothing checks those
 * strings against each other, and every way of getting them wrong is
 * silent — a missing file is a 404 and the system's Thai font; a preload
 * whose path differs from the stylesheet's by one character is a font
 * downloaded twice.
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

const css = read("app/styles/shared.css");
const faces = [...css.matchAll(/@font-face \{ font-family: "FC Vision"; src: url\("([^"]+)"\) format\("woff2"\); font-weight: (\d+);/g)].map(
  (match) => ({ url: match[1], weight: Number(match[2]) }),
);

/** The paths a component's preload constant expands to. */
function preloads(file: string, constant: string): string[] {
  const match = read(file).match(new RegExp(`const ${constant} = \\[([^\\]]+)\\]\\.map\\(\\(weight\\) => \`([^\`]+)\`\\)`));
  if (!match) throw new Error(`${constant} not found in ${file}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((weight) => match[2].replace("${weight}", weight[1]));
}

describe("the Thai typeface", () => {
  it("declares the five weights, each over a file that exists", () => {
    expect(faces.map((face) => face.weight)).toEqual([300, 400, 500, 700, 900]);
    for (const face of faces) {
      expect(fs.existsSync(path.join(ROOT, "public", face.url)), face.url).toBe(true);
    }
  });

  it("preloads only files the stylesheet uses, spelled the same way", () => {
    const urls = faces.map((face) => face.url);
    const everywhere = preloads("app/[locale]/layout.tsx", "THAI_FONT_PRELOADS");
    const home = preloads("app/[locale]/(site)/page.tsx", "HERO_THAI_FONT_PRELOADS");
    expect(everywhere.length).toBeGreaterThan(0);
    for (const href of [...everywhere, ...home]) expect(urls).toContain(href);
    // A weight preloaded twice is the same link in <head> twice.
    expect(new Set([...everywhere, ...home]).size).toBe(everywhere.length + home.length);
  });

  it("is served as immutable, which is why its folder carries a version", () => {
    expect(read("next.config.js")).toMatch(/source: "\/fonts\/:path\*",\s+headers: \[\{ key: "Cache-Control", value: "public, max-age=31536000, immutable" \}\]/);
    for (const face of faces) expect(face.url).toMatch(/^\/fonts\/fc-vision-v\d+\//);
  });

  it("keeps the two TTFs the share-image renderer reads", () => {
    for (const weight of ["Regular", "Bold"]) {
      expect(fs.existsSync(path.join(ROOT, "fonts/fc-vision", `FCVision-${weight}.ttf`))).toBe(true);
    }
  });
});
