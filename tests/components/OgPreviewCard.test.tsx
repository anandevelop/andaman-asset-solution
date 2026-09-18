/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/OgPreviewCard.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Mirrors tests/components/SeoPreviewFields.test.tsx's highlighting
 * coverage for this sibling preview card.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import OgPreviewCard from "@/components/admin/OgPreviewCard";

const BASE_PROPS = {
  title: "Beachfront villas in Phuket",
  description: "A guide to owning a beachfront villa in Phuket.",
  imageUrl: null,
  siteUrl: "https://andamanassetsolution.com",
  label: "Share preview",
  hint: "Approximate",
};

describe("OgPreviewCard", () => {
  it("renders the domain without the protocol", () => {
    const { getByText } = render(<OgPreviewCard {...BASE_PROPS} focusKeyword="" />);
    expect(getByText("andamanassetsolution.com")).toBeInTheDocument();
  });

  it("renders plain text when focusKeyword is blank", () => {
    render(<OgPreviewCard {...BASE_PROPS} focusKeyword="" />);
    expect(document.querySelector("mark")).toBeNull();
  });

  it("highlights a case-insensitive match", () => {
    render(<OgPreviewCard {...BASE_PROPS} focusKeyword="beachfront villas" />);
    const mark = document.querySelector("mark");
    expect(mark?.textContent).toBe("Beachfront villas");
  });
});
