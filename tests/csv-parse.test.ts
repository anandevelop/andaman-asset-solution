/**
 * tests/csv-parse.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * parseCsv — the reading half of lib/csv.ts, used by the units importer.
 * Its inputs are files a person exported from Excel or Sheets, so the
 * cases below are the ones those actually produce.
 */

import { describe, it, expect } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads a plain document", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF, which is what Excel writes", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('unit,location\nV-01,"Cherngtalay, Thalang"')).toEqual([
      ["unit", "location"],
      ["V-01", "Cherngtalay, Thalang"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('note\n"line one\nline two"')).toEqual([["note"], ["line one\nline two"]]);
  });

  it("preserves empty trailing fields but not empty trailing lines", () => {
    expect(parseCsv("a,b,c\n1,,\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });

  it("strips the BOM this module's own writer emits", () => {
    // Round trip: what toCsv produces must read back unchanged.
    const csv = toCsv(["unit", "view"], [["V-07", "Sea view"]]);
    expect(parseCsv(csv)).toEqual([
      ["unit", "view"],
      ["V-07", "Sea view"],
    ]);
  });

  it("reads Thai text unchanged", () => {
    expect(parseCsv("ทิศ,วิว\nตะวันตก,วิวทะเล")).toEqual([
      ["ทิศ", "วิว"],
      ["ตะวันตก", "วิวทะเล"],
    ]);
  });
});
