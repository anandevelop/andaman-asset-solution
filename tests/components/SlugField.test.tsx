/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/SlugField.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The reported bug: typing "The Victory Villas" into the Project/News/
 * Event/E-Brochure editors' slug field produced exactly that — capitals
 * and spaces — because the field was a bare uncontrolled <input> with no
 * normalization. This exercises the real component through actual
 * keystrokes (userEvent.type), not just the pure lib/slugify.ts functions
 * it wraps.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SlugField from "@/components/admin/SlugField";

describe("SlugField", () => {
  it("slugifies a title typed in as-is", async () => {
    const user = userEvent.setup();
    render(<SlugField id="slug" />);

    await user.type(screen.getByRole("textbox"), "The Victory Villas");

    expect(screen.getByRole("textbox")).toHaveValue("the-victory-villas");
  });

  it("cleans up a trailing hyphen on blur", async () => {
    const user = userEvent.setup();
    render(<SlugField id="slug" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "The Victory Villas ");
    // Mid-type, the trailing space is a hyphen, not yet trimmed away —
    // see slugifyLive's own header comment for why.
    expect(input).toHaveValue("the-victory-villas-");

    await user.tab();
    expect(input).toHaveValue("the-victory-villas");
  });

  it("leaves an already-valid slug untouched", () => {
    render(<SlugField id="slug" defaultValue="the-victory-villas" />);

    expect(screen.getByRole("textbox")).toHaveValue("the-victory-villas");
  });

  it("submits under the given name", () => {
    render(<SlugField id="slug" name="slug" defaultValue="villa-one" />);

    expect(screen.getByRole("textbox")).toHaveAttribute("name", "slug");
  });
});
