/**
 * e2e/fixtures/sample-pdf.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A real, valid, multi-page PDF, built in code rather than committed as a
 * binary.
 *
 * Two reasons it is generated:
 *
 *   - a committed .pdf is opaque in a diff, and nobody reviewing a change
 *     to it can tell what actually changed;
 *   - the byte offsets in an xref table have to be exact, and computing
 *     them here means the file cannot rot when someone edits the content.
 *
 * Four pages, because the flipbook's spread logic only has something to do
 * with more than two, and each carries a large numeral so a test — or a
 * person — can tell at a glance which page is showing.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** A4 at 72dpi, the shape a real brochure arrives in. */
const PORTRAIT = { width: 595, height: 842 };

/*
  A4 landscape, which is what a "sale kit" is usually exported as — and the
  shape that made the flipbook's single-page decision matter. Two landscape
  pages side by side is a 2.8:1 strip; on a phone that is unreadable, so the
  viewer has to collapse to one page regardless of how much width it has.
*/
const LANDSCAPE = { width: 842, height: 595 };

export const SAMPLE_PDF_PAGE_COUNT = 4;

/** Page content: a big centred numeral, drawn with the base Helvetica. */
function pageStream(pageNumber: number): string {
  return `BT /F1 240 Tf 210 380 Td (${pageNumber}) Tj ET`;
}

/**
 * Assemble the file, tracking the byte offset of every object so the xref
 * table is correct. pdf.js can recover from a broken one, but a fixture
 * that quietly exercises the recovery path is testing the wrong thing.
 */
export function buildSamplePdf(
  { pageCount = SAMPLE_PDF_PAGE_COUNT, landscape = false } = {},
): Buffer {
  const { width: WIDTH, height: HEIGHT } = landscape ? LANDSCAPE : PORTRAIT;
  const objects: string[] = [];

  // 1 = catalog, 2 = page tree, 3 = font. Pages and their content streams
  // follow in pairs, so page N is object 4 + (N-1) * 2.
  const pageObjectNumber = (index: number) => 4 + index * 2;
  const kids = Array.from({ length: pageCount }, (_, i) => `${pageObjectNumber(i)} 0 R`);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = pageObjectNumber(index);
    const contentNumber = pageNumber + 1;
    const stream = pageStream(index + 1);

    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`;

    objects[contentNumber] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (let number = 1; number < objects.length; number += 1) {
    offsets[number] = pdf.length;
    pdf += `${number} 0 obj\n${objects[number]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  const count = objects.length; // object 0 is the free-list head

  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let number = 1; number < count; number += 1) {
    pdf += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
  }

  pdf +=
    `trailer\n<< /Size ${count} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  // latin1: every byte written above is ASCII, and utf8 would silently
  // change the length of anything that was not — which would corrupt the
  // offsets the xref table just recorded.
  return Buffer.from(pdf, "latin1");
}
