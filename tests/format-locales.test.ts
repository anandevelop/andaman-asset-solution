import { describe, expect, it } from "vitest";
import { formatNumber, intlLocale } from "@/lib/format";

/* zh and ru fell back to en-US, so their pages printed "October 14, 2026". */
describe("intlLocale", () => {
  it.each([["th", "th-TH"], ["en", "en-US"], ["zh", "zh-CN"], ["ru", "ru-RU"]])("%s → %s", (locale, tag) => {
    expect(intlLocale(locale)).toBe(tag);
  });

  it("formats a Chinese and a Russian date in their own language", () => {
    const date = new Date("2026-10-14T03:00:00Z");
    const fmt = (l: string) => new Intl.DateTimeFormat(intlLocale(l), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
    expect(fmt("zh")).toBe("2026年10月14日");
    expect(fmt("ru")).toMatch(/^14 октября 2026/);
  });

  it("gives Russian its own thousands separator", () => {
    expect(formatNumber("ru", 1234)).not.toBe("1,234");
  });
});
