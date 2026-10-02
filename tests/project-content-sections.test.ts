/**
 * tests/project-content-sections.test.ts — the content tab draws its fields
 * from CONTENT_SECTIONS, so a field left out of every section would simply
 * vanish from the screen while still being saved and shown publicly.
 */

import { describe, expect, it } from "vitest";
import { CONTENT_FIELDS, CONTENT_SECTIONS } from "@/lib/project-content";

describe("CONTENT_SECTIONS", () => {
  it("covers every content field exactly once", () => {
    const grouped = CONTENT_SECTIONS.flatMap((section) => section.fields);
    expect([...grouped].sort()).toEqual([...CONTENT_FIELDS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});
