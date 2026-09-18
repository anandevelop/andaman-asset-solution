/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/MarkdownToolbar.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Each button is string surgery on a textarea's selection — the risk is a
 * button that corrupts surrounding text or drops the cursor somewhere
 * useless, not anything a snapshot would catch. A tiny harness component
 * stands in for BodyField, since the toolbar takes a ref + controlled
 * value/onChange rather than owning a textarea itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarkdownToolbar, { type MarkdownToolbarLabels } from "@/components/admin/MarkdownToolbar";

const LABELS: MarkdownToolbarLabels = {
  toolbar: "Formatting",
  heading2: "Heading",
  heading3: "Subheading",
  bold: "Bold",
  italic: "Italic",
  bulletList: "Bullet list",
  quote: "Quote",
  link: "Link",
};

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <MarkdownToolbar textareaRef={textareaRef} value={value} onChange={setValue} labels={LABELS} />
      <textarea ref={textareaRef} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}

async function selectAll(textarea: HTMLTextAreaElement) {
  textarea.setSelectionRange(0, textarea.value.length);
}

describe("MarkdownToolbar", () => {
  it("wraps a selection in bold markers", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hello world" />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await selectAll(textarea);
    await user.click(screen.getByRole("button", { name: "Bold" }));

    expect(textarea).toHaveValue("**hello world**");
  });

  it("inserts a bold placeholder when nothing is selected", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);

    await user.click(screen.getByRole("button", { name: "Bold" }));

    expect(screen.getByRole("textbox")).toHaveValue("**bold text**");
  });

  it("prefixes the current line with a heading marker", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Some text" />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    await user.click(screen.getByRole("button", { name: "Heading" }));

    expect(textarea).toHaveValue("## Some text");
  });

  it("replaces an existing heading marker rather than stacking a second one", async () => {
    const user = userEvent.setup();
    render(<Harness initial="## Some text" />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    await user.click(screen.getByRole("button", { name: "Subheading" }));

    expect(textarea).toHaveValue("### Some text");
  });

  it("prefixes every selected line for a bullet list", async () => {
    const user = userEvent.setup();
    render(<Harness initial={"first\nsecond"} />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await selectAll(textarea);
    await user.click(screen.getByRole("button", { name: "Bullet list" }));

    expect(textarea).toHaveValue("- first\n- second");
  });

  it("prefixes every selected line for a quote", async () => {
    const user = userEvent.setup();
    render(<Harness initial={"first\nsecond"} />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await selectAll(textarea);
    await user.click(screen.getByRole("button", { name: "Quote" }));

    expect(textarea).toHaveValue("> first\n> second");
  });

  it("wraps a selection as a link with an editable URL placeholder", async () => {
    const user = userEvent.setup();
    render(<Harness initial="our villas" />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await selectAll(textarea);
    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(textarea).toHaveValue("[our villas](https://)");
  });

  it("inserts a link template when nothing is selected", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(screen.getByRole("textbox")).toHaveValue("[text](https://)");
  });
});
