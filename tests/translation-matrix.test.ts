/**
 * tests/translation-matrix.test.ts — the translations screen's matrix
 * (translationMatrix in lib/locale-completeness.ts). It is derived from the
 * gap report rather than queried separately, so these check the derivation:
 * a matrix cell must equal "records of that type, minus the ones listed as
 * missing that language".
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { translationMatrix } = await import("@/lib/locale-completeness");

type Report = Parameters<typeof translationMatrix>[0];

const report: Report = {
  sections: [
    { section: "faq", group: "staticPages", total: 4 },
    { section: "unitTypes", group: "projects", total: 3 },
    { section: "awards", group: "staticPages", total: 0 },
  ],
  totalItems: 7,
  groups: [
    {
      group: "staticPages",
      items: [
        { id: "f1", section: "faq", label: "FAQ — a", editHref: "/pages/faq", missingLocales: ["ru"] },
        { id: "f2", section: "faq", label: "FAQ — b", editHref: "/pages/faq", missingLocales: ["zh", "ru"] },
      ],
    },
    {
      group: "projects",
      items: [
        { id: "u1", section: "unitTypes", label: "House type — A", editHref: "/projects/p/unit-types", missingLocales: ["th", "en", "zh", "ru"] },
      ],
    },
  ],
};

describe("translationMatrix", () => {
  const rows = translationMatrix(report);

  it("counts, per type and language, the records that have it", () => {
    const faq = rows.find((row) => row.section === "faq")!;
    expect(faq.total).toBe(4);
    expect(faq.have).toEqual({ th: 4, en: 4, zh: 3, ru: 2 });

    const unitTypes = rows.find((row) => row.section === "unitTypes")!;
    expect(unitTypes.have).toEqual({ th: 2, en: 2, zh: 2, ru: 2 });
  });

  it("leaves out a type with no records rather than drawing 0 / 0", () => {
    expect(rows.map((row) => row.section)).not.toContain("awards");
  });

  it("keeps the report's order", () => {
    expect(rows.map((row) => row.section)).toEqual(["faq", "unitTypes"]);
  });
});
