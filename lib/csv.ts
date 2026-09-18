/**
 * lib/csv.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CSV serialisation, with the two things that go wrong in every hand-rolled
 * exporter.
 *
 * 1. Formula injection. A cell beginning =, +, - or @ is executed as a
 *    formula when the file is opened in Excel or Sheets. A lead whose name
 *    field contains `=HYPERLINK("http://evil.test","Click")` becomes a live
 *    link in the sales team's spreadsheet — and `=cmd|'/c calc'!A0` is a
 *    documented remote-execution path in older Excel. This is a real attack
 *    on our own staff, delivered through a public form, and the export is
 *    where it lands. Such cells are prefixed with a tab, which Excel
 *    ignores for display but which stops the formula parser.
 *
 * 2. Thai text in Excel. Without a UTF-8 byte-order mark, Excel on Windows
 *    guesses the local ANSI codepage and renders every Thai character as
 *    mojibake. The BOM is three bytes that make the difference between a
 *    usable file and a support ticket.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Characters that make Excel treat a cell as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Escape one value for CSV.
 *
 * Quoting is applied whenever the value contains a delimiter, a quote or a
 * newline — and quotes inside are doubled, per RFC 4180.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = value instanceof Date ? value.toISOString() : String(value);

  // Neutralise formulas before quoting, so the guard survives escaping.
  if (FORMULA_PREFIX.test(text)) text = `\t${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/** One row, comma separated. */
export function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(",");
}

/**
 * Full document: header, rows, CRLF line endings and a UTF-8 BOM.
 *
 * CRLF rather than LF because RFC 4180 specifies it and older Excel builds
 * on Windows treat a lone LF as part of the field.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const body = [toCsvRow(headers), ...rows.map(toCsvRow)].join("\r\n");

  return `﻿${body}\r\n`;
}

/**
 * Parse a CSV document into rows of raw strings — the reading half, for
 * the units importer (Units.dc.html's "นำเข้า CSV").
 *
 * Deliberately small rather than a dependency: this reads files a person
 * exported from Excel or Sheets minutes earlier, which is the well-behaved
 * end of the format. It handles what those actually produce — quoted
 * fields, embedded commas and newlines, doubled quotes, CRLF or LF, and a
 * leading BOM (including one this module's own toCsv wrote).
 *
 * It does not attempt other delimiters, alternate encodings, or the
 * ambiguous cases RFC 4180 leaves open; a file that needs those is one to
 * re-export rather than to guess at. The importer surfaces the row it
 * could not read instead of silently dropping it.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Distinguishes an empty trailing line (which is not a row) from a real
  // row whose last field happens to be empty.
  let started = false;

  const input = text.replace(/^﻿/, "");

  const endField = () => {
    row.push(field);
    field = "";
    started = true;
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\r") {
      // Swallow CR; the LF that follows ends the row (a lone CR does too).
      if (input[index + 1] !== "\n") endRow();
    } else if (char === "\n") {
      endRow();
    } else {
      field += char;
    }
  }

  if (started || field !== "" || quoted) endRow();

  return rows;
}

/**
 * A filename that is safe in Content-Disposition and on every filesystem.
 *
 * Quotes and semicolons in a filename can break out of the header value,
 * and a slash would be read as a path.
 */
export function csvFilename(base: string, date = new Date()): string {
  const safe = base.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
  const stamp = date.toISOString().slice(0, 10);

  return `${safe}-${stamp}.csv`;
}
