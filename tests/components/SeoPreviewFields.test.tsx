/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/SeoPreviewFields.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The one behavior added to this shared component for the SEO panel
 * redesign: optional focusKeyword highlighting in the SERP preview. Every
 * other behavior (char counters, controlled/uncontrolled mode) predates
 * this file and isn't re-tested here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SeoPreviewFields from "@/components/admin/SeoPreviewFields";

const BASE_PROPS = {
  titleLabel: "Meta title",
  descriptionLabel: "Meta description",
  defaultTitle: "Beachfront villas in Phuket",
  defaultDescription: "A guide to owning a beachfront villa in Phuket.",
  fallbackTitle: "Untitled",
  fallbackDescription: "No description",
  displayPath: "example.com › news › beachfront-villas",
  previewLabel: "Google preview",
  previewHint: "Approximate",
};

describe("SeoPreviewFields — focusKeyword highlighting", () => {
  it("renders plain text when focusKeyword is omitted", () => {
    render(<SeoPreviewFields {...BASE_PROPS} />);
    expect(screen.queryByText("mark")).not.toBeInTheDocument();
    expect(document.querySelector("mark")).toBeNull();
    expect(screen.getByText("Beachfront villas in Phuket")).toBeInTheDocument();
  });

  it("highlights a case-insensitive match in the title", () => {
    render(<SeoPreviewFields {...BASE_PROPS} focusKeyword="beachfront villas" />);
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent).toBe("Beachfront villas");
  });

  it("highlights a match in the description too", () => {
    render(<SeoPreviewFields {...BASE_PROPS} focusKeyword="villa" />);
    const marks = Array.from(document.querySelectorAll("mark")).map((m) => m.textContent);
    expect(marks).toContain("villa");
  });

  it("renders plain text when the keyword matches nothing", () => {
    render(<SeoPreviewFields {...BASE_PROPS} focusKeyword="condos" />);
    expect(document.querySelector("mark")).toBeNull();
  });

  it("renders plain text when the keyword is blank", () => {
    render(<SeoPreviewFields {...BASE_PROPS} focusKeyword="   " />);
    expect(document.querySelector("mark")).toBeNull();
  });
});
