/**
 * tests/paste-html.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Pasting from Word and Google Docs.
 *
 * The fixtures below are the real shape of what those two put on the
 * clipboard — nested spans carrying generated class names and inline
 * styles, Word's conditional comments and <o:p> elements, Google Docs'
 * whole stylesheet — trimmed to the parts that matter rather than
 * invented. That shape is the point: it is what TipTap's schema has no
 * rule for, and what made a pasted paragraph vanish entirely.
 *
 * The assertions are about structure surviving and decoration leaving,
 * not about byte-for-byte output — the cleaner is allowed to get tidier
 * without these needing a rewrite.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { cleanPastedHtml, hasInlineImageData } from "@/lib/paste-html";

const WORD = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word">
<!--[if gte mso 9]><xml><w:WordDocument></w:WordDocument></xml><![endif]-->
<meta charset="utf-8">
<style><!-- p.MsoNormal { margin:0cm; font-family:"Calibri",sans-serif; } --></style>
<body>
<p class="MsoNormal" style="margin:0cm"><span style='font-size:11.0pt;font-family:"Calibri",sans-serif'>The villa sits on <b style="mso-bidi-font-weight:normal">Pasak 8</b>.<o:p></o:p></span></p>
<p class="MsoNormal" style="margin:0cm"><span style='font-size:11.0pt'>&nbsp;<o:p></o:p></span></p>
<h2 class="MsoNormal"><span style='font-size:14.0pt'>Location</span></h2>
<p class="MsoNormal"><span><a href="https://example.test/x" style="color:blue">A link</a></span></p>
</body></html>`;

const GOOGLE_DOCS = `
<meta charset="utf-8">
<b style="font-weight:normal;" id="docs-internal-guid-1234">
<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
  <span style="font-size:11pt;font-family:Arial;color:#000000;white-space:pre-wrap;">Bangtao beach is </span>
  <span style="font-size:11pt;font-weight:700;white-space:pre-wrap;">seven minutes</span>
  <span style="font-size:11pt;white-space:pre-wrap;"> away.</span>
</p>
<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">
  <li dir="ltr" style="list-style-type:disc;font-size:11pt;">
    <p dir="ltr" style="line-height:1.38;"><span style="font-size:11pt;">Three bedrooms</span></p>
  </li>
</ul>
</b>`;

describe("cleanPastedHtml — Word", () => {
  const cleaned = cleanPastedHtml(WORD);

  it("keeps the words and the structure around them", () => {
    expect(cleaned).toContain("The villa sits on");
    expect(cleaned).toContain("<b>Pasak 8</b>");
    expect(cleaned).toContain("<h2>Location</h2>");
  });

  it("keeps a link's href and drops the colour it was painted with", () => {
    expect(cleaned).toContain('href="https://example.test/x"');
    expect(cleaned).not.toMatch(/color:blue/);
  });

  it("removes the Office scaffolding TipTap has no rule for", () => {
    expect(cleaned).not.toMatch(/<o:p>/i);
    expect(cleaned).not.toMatch(/<!--/);
    expect(cleaned).not.toMatch(/<style/i);
    expect(cleaned).not.toMatch(/MsoNormal/);
    expect(cleaned).not.toMatch(/\sstyle=/i);
    expect(cleaned).not.toMatch(/\sclass=/i);
  });

  it("drops the empty spacer paragraphs Word puts between real ones", () => {
    expect(cleaned).not.toMatch(/<p>\s*<\/p>/);
  });
});

describe("cleanPastedHtml — Google Docs", () => {
  const cleaned = cleanPastedHtml(GOOGLE_DOCS);

  it("keeps the sentence intact across the spans it was split into", () => {
    // Docs splits one sentence across three styled spans; unwrapping them
    // has to leave the text adjacent, not three separate fragments.
    expect(cleaned.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain(
      "Bangtao beach is seven minutes away.",
    );
  });

  it("keeps the list", () => {
    expect(cleaned).toContain("<ul>");
    expect(cleaned).toContain("<li>");
    expect(cleaned).toContain("Three bedrooms");
  });

  it("drops the generated ids, fonts and white-space styling", () => {
    expect(cleaned).not.toMatch(/docs-internal-guid/);
    expect(cleaned).not.toMatch(/white-space:pre-wrap/);
    expect(cleaned).not.toMatch(/\sstyle=/i);
  });
});

describe("cleanPastedHtml — what it refuses to guess", () => {
  it("does not promote a fully-bold paragraph to a heading", () => {
    // Word documents are full of bold lines that are not headings. Getting
    // this wrong is harder to undo than adding the heading by hand.
    const cleaned = cleanPastedHtml("<p><b>Not a heading</b></p>");
    expect(cleaned).toContain("<p>");
    expect(cleaned).not.toMatch(/<h[1-6]>/);
  });

  it("leaves already-clean HTML alone", () => {
    const clean = "<p>Plain <strong>and bold</strong>.</p>";
    expect(cleanPastedHtml(clean)).toBe(clean);
  });
});

describe("hasInlineImageData", () => {
  it("spots the base64 image Word pastes a screenshot as", () => {
    // The sanitizer refuses data: URLs, so these were vanishing on save
    // with nothing said — the editor now says something.
    expect(hasInlineImageData('<p><img src="data:image/png;base64,iVBOR"></p>')).toBe(true);
  });

  it("does not fire on a normal image", () => {
    expect(hasInlineImageData('<p><img src="https://example.test/a.jpg"></p>')).toBe(false);
  });
});
