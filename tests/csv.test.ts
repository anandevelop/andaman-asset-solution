/**
 * tests/csv.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CSV serialisation for the lead export.
 *
 * The formula-injection tests are the point. A lead submits their name
 * through a public form; that name lands in a CSV; the sales team opens it
 * in Excel. Without the guard, `=HYPERLINK(...)` in a name field becomes a
 * live link in the team's spreadsheet, and `=cmd|'/c calc'!A0` is a
 * documented code-execution path in older Excel builds.
 *
 * This is an attack on our own staff, delivered through a form we
 * published, and the export is the only place it can be stopped.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { escapeCsvValue, toCsvRow, toCsv, csvFilename } from "@/lib/csv";

describe("escapeCsvValue — formula injection", () => {
  it.each([
    ["equals", '=1+1'],
    ["plus", "+1+1"],
    ["minus", "-1+1"],
    ["at", "@SUM(A1)"],
    ["hyperlink", '=HYPERLINK("http://evil.test","Click me")'],
    ["legacy cmd", "=cmd|'/c calc'!A0"],
    ["dde", "@SUM(1+9)*cmd|' /C calc'!A0"],
    ["leading tab", "\tinjected"],
  ])("neutralises a %s prefix", (_name, payload) => {
    const escaped = escapeCsvValue(payload);

    // A tab is prepended, so the first character is no longer a trigger.
    expect(escaped.replace(/^"/, "").startsWith("\t")).toBe(true);
  });

  it("leaves an ordinary name untouched", () => {
    expect(escapeCsvValue("Somchai Tanaphon")).toBe("Somchai Tanaphon");
  });

  it("does not treat a minus mid-string as a formula", () => {
    // Only a *leading* character triggers Excel's parser.
    expect(escapeCsvValue("076-123-456")).toBe("076-123-456");
  });

  it("still escapes a formula that also needs quoting", () => {
    const escaped = escapeCsvValue('=1,2');

    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped).toContain("\t=1,2");
  });
});

describe("escapeCsvValue — RFC 4180 quoting", () => {
  it("quotes values containing a comma", () => {
    expect(escapeCsvValue("Bangkok, Thailand")).toBe('"Bangkok, Thailand"');
  });

  it("doubles inner quotes", () => {
    expect(escapeCsvValue('He said "yes"')).toBe('"He said ""yes"""');
  });

  it("quotes values containing a newline", () => {
    expect(escapeCsvValue("line one\nline two")).toBe('"line one\nline two"');
  });

  it("quotes values containing a carriage return", () => {
    expect(escapeCsvValue("a\r\nb")).toContain('"');
  });

  it("renders null and undefined as empty", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("renders a Date as ISO 8601", () => {
    const date = new Date("2026-08-11T03:00:00.000Z");

    expect(escapeCsvValue(date)).toBe("2026-08-11T03:00:00.000Z");
  });

  it("leaves Thai text unquoted and unmangled", () => {
    expect(escapeCsvValue("สมชาย ธนพล")).toBe("สมชาย ธนพล");
  });

  it("renders numbers and booleans", () => {
    expect(escapeCsvValue(0)).toBe("0");
    expect(escapeCsvValue(false)).toBe("false");
  });
});

describe("toCsvRow", () => {
  it("joins with commas", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("keeps empty cells positional", () => {
    // A dropped empty value would shift every later column left.
    expect(toCsvRow(["a", null, "c"])).toBe("a,,c");
    expect(toCsvRow(["a", null, "c"]).split(",")).toHaveLength(3);
  });
});

describe("toCsv", () => {
  const csv = toCsv(["name", "email"], [["Somchai", "a@b.co"]]);

  it("starts with a UTF-8 BOM", () => {
    // Without it, Excel on Windows guesses the ANSI codepage and Thai text
    // arrives as mojibake.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings", () => {
    expect(csv).toContain("\r\n");
    // No bare LF outside a CRLF pair.
    expect(/[^\r]\n/.test(csv)).toBe(false);
  });

  it("puts the header first", () => {
    expect(csv.slice(1).startsWith("name,email")).toBe(true);
  });

  it("ends with a newline", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("produces header-only output for no rows", () => {
    const empty = toCsv(["a", "b"], []);

    expect(empty.slice(1).trim()).toBe("a,b");
  });

  it("keeps every row on its own line", () => {
    const many = toCsv(["a"], [["1"], ["2"], ["3"]]);

    expect(many.trim().split("\r\n")).toHaveLength(4);
  });
});

describe("csvFilename", () => {
  const date = new Date("2026-08-11T00:00:00.000Z");

  it("appends an ISO date", () => {
    expect(csvFilename("leads", date)).toBe("leads-2026-08-11.csv");
  });

  it("strips characters that would break Content-Disposition", () => {
    // A quote or semicolon could terminate the header value early.
    const name = csvFilename('leads";drop', date);

    expect(name).not.toContain('"');
    expect(name).not.toContain(";");
  });

  it("strips path separators", () => {
    expect(csvFilename("../../etc/passwd", date)).not.toContain("/");
  });

  it("caps the length", () => {
    expect(csvFilename("a".repeat(200), date).length).toBeLessThan(80);
  });
});
