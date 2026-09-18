/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/LanguageTabs.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The `percent` prop's mini completion ring — additive to the existing
 * Check/AlertTriangle boolean indicator, and the LOCALE_DISPLAY_ORDER
 * (Thai-first) tab order Phase 6.3 asks for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";
import LanguageTabs from "@/components/admin/LanguageTabs";
import { render, screen } from "./render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/admin/news/abc/edit",
  useSearchParams: () => new URLSearchParams(),
}));

const COMPLETE = { en: true, th: true, zh: true, ru: true };

describe("LanguageTabs", () => {
  it("renders tabs Thai-first (LOCALE_DISPLAY_ORDER), not English-first", () => {
    render(
      <LanguageTabs active="th" completeness={COMPLETE} completeLabel="Complete" missingLabel="Missing" />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.replace(/[^A-Z]/g, ""))).toEqual(["TH", "EN", "ZH", "RU"]);
  });

  it("falls back to the Check/AlertTriangle icon when `percent` is omitted", () => {
    const { container } = render(
      <LanguageTabs active="en" completeness={{ ...COMPLETE, th: false }} completeLabel="Complete" missingLabel="Missing" />,
    );

    // No ring SVG (aria-label ending in "%") anywhere without `percent`.
    expect(container.querySelector('svg[aria-label$="%"]')).toBeNull();
  });

  it("renders a completion ring for a locale present in `percent`", () => {
    render(
      <LanguageTabs
        active="en"
        completeness={COMPLETE}
        completeLabel="Complete"
        missingLabel="Missing"
        percent={{ th: 50 }}
      />,
    );

    expect(screen.getByRole("img", { name: "50%" })).toBeInTheDocument();
  });
});
