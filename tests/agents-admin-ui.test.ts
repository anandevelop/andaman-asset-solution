/**
 * tests/agents-admin-ui.test.ts
 * Two small things the real agent list got wrong the first time it was
 * loaded: a sales person's nickname, and avatar initials.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { salesNick } from "@/lib/agents/admin";
import { initialsOf } from "@/components/admin/agents/ui";

describe("salesNick", () => {
  it("skips a title", () => {
    expect(salesNick({ nameEn: "Mr. Ray Boonmee", nameTh: "" })).toBe("Ray");
    expect(salesNick({ nameEn: "Khun Vee S.", nameTh: "" })).toBe("Vee");
    expect(salesNick({ nameEn: "", nameTh: "คุณ วี สุขใจ" })).toBe("วี");
  });

  it("leaves an ordinary name alone", () => {
    expect(salesNick({ nameEn: "Ray B.", nameTh: "เรย์" })).toBe("Ray");
    expect(salesNick({ nameEn: "Mira", nameTh: "" })).toBe("Mira");
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Li Wei")).toBe("LW");
    expect(initialsOf("Eleanora")).toBe("E");
    expect(initialsOf("กมลชนก ศรีสุข")).toBe("กศ");
  });

  it("files a Thai word under its consonant, not its leading vowel", () => {
    expect(initialsOf("เอกชัย ใจดี")).toBe("อจ");
  });

  it("ignores words that are not a name", () => {
    expect(initialsOf("Владимир | Недвижимость Пхукета")).toBe("ВН");
    expect(initialsOf("  ")).toBe("?");
  });
});
