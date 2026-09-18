/**
 * tests/content-links.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * extractLinks is what the broken-link scan sees. A regex that misses a
 * form makes the scan quietly report "no broken links" on a page full of
 * them, which is worse than not having the scan; one that over-matches
 * fills the list with things nobody wrote.
 *
 * The cases below are the shapes this database actually holds: Markdown as
 * authored in the news editor, and HTML pasted in from Word or carried
 * over from the previous site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { extractLinks, isCheckableLink } from "@/lib/content-links";

describe("extractLinks", () => {
  it("reads a Markdown link", () => {
    expect(extractLinks("See [our villas](/th/projects/andaman-bay) today.")).toEqual([
      { target: "/th/projects/andaman-bay", isImage: false },
    ]);
  });

  it("tells a Markdown image from a Markdown link", () => {
    expect(extractLinks("![Pool](/img/pool.webp) and [details](/projects/x)")).toEqual([
      { target: "/img/pool.webp", isImage: true },
      { target: "/projects/x", isImage: false },
    ]);
  });

  it("reads an anchor and an img out of pasted HTML", () => {
    const html = `<p><a href="/th/contact">Contact</a> <img src="https://old.example/x.jpg" alt=""></p>`;
    expect(extractLinks(html)).toEqual([
      { target: "/th/contact", isImage: false },
      { target: "https://old.example/x.jpg", isImage: true },
    ]);
  });

  it("handles single quotes and odd spacing in attributes", () => {
    expect(extractLinks(`<a  href = '/news/a' >x</a>`)).toEqual([
      { target: "/news/a", isImage: false },
    ]);
  });

  it("takes the URL only, leaving a Markdown title behind", () => {
    expect(extractLinks('[x](/projects/villa "Our best villa")')).toEqual([
      { target: "/projects/villa", isImage: false },
    ]);
  });

  it("reads a link whose text is empty", () => {
    expect(extractLinks("[](/projects/villa)")).toEqual([
      { target: "/projects/villa", isImage: false },
    ]);
  });

  it("finds every link in a long body, not just the first", () => {
    const body = "[a](/news/a)\n\ntext\n\n[b](/news/b)\n\n<a href='/news/c'>c</a>";
    expect(extractLinks(body).map((link) => link.target)).toEqual(["/news/a", "/news/b", "/news/c"]);
  });

  it("returns nothing for empty content", () => {
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks("")).toEqual([]);
    expect(extractLinks("Plain text with no links at all.")).toEqual([]);
  });
});

describe("isCheckableLink", () => {
  it("skips the things a link checker has no opinion about", () => {
    expect(isCheckableLink("#gallery")).toBe(false);
    expect(isCheckableLink("mailto:sales@example.com")).toBe(false);
    expect(isCheckableLink("tel:+66123456789")).toBe(false);
    expect(isCheckableLink("data:image/png;base64,iVBOR")).toBe(false);
  });

  it("checks real destinations", () => {
    expect(isCheckableLink("/projects/villa")).toBe(true);
    expect(isCheckableLink("https://example.com")).toBe(true);
  });
});
