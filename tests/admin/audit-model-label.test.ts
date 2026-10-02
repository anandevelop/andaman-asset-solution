/**
 * tests/admin/audit-model-label.test.ts — the activity trail's names for
 * records (lib/admin/audit-model-label.ts).
 */

import { describe, expect, it } from "vitest";
import { auditModelLabel, splitModelName } from "@/lib/admin/audit-model-label";

const labels = { FloorPlanRoom: "ห้องในแปลน", Project: "โครงการ", translationSuffix: "(คำแปล)" };

describe("auditModelLabel", () => {
  it("uses the label when there is one", () => {
    expect(auditModelLabel("Project", labels)).toBe("โครงการ");
  });

  it("names a translation row by its parent", () => {
    expect(auditModelLabel("FloorPlanRoomTranslation", labels)).toBe("ห้องในแปลน (คำแปล)");
  });

  it("falls back to words, never the raw name, for a model with no label", () => {
    expect(auditModelLabel("SeoAlertRule", labels)).toBe("Seo alert rule");
    expect(auditModelLabel("EBrochureTranslation", labels)).toBe("E brochure (คำแปล)");
  });
});

describe("splitModelName", () => {
  it("splits camel case and keeps acronyms together", () => {
    expect(splitModelName("HeroStorySlide")).toBe("Hero story slide");
    expect(splitModelName("FAQEntry")).toBe("Faq entry");
  });
});
