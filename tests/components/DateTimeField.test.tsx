/**
 * @vitest-environment jsdom
 *
 * Renders React, so it needs a DOM. Vitest 4 removed `environmentMatchGlobs`
 * from vitest.config.ts; the docblock is the replacement, and it has to be
 * the first thing in the file.
 */
/**
 * tests/components/DateTimeField.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The reason this component exists is the first test below: the calendar
 * has to speak the language the back office is set to. `<input
 * type="datetime-local">` could not, because Chromium localizes its native
 * picker from the browser's UI language and ignores the page's — so an
 * admin who chose English still got a Thai calendar.
 *
 * The rest pin the form contract the native input used to provide, since
 * the server was deliberately left untouched: same name, same
 * "YYYY-MM-DDTHH:mm", and "" still meaning unset.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import DateTimeField from "@/components/admin/DateTimeField";
import { render, screen, userEvent, within } from "./render";

const VALUE = "2026-09-21T13:29";

const hidden = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="hidden"][name="publishedAt"]');

function field(value = VALUE) {
  return <DateTimeField id="publishedAt" name="publishedAt" defaultValue={value} />;
}

describe("DateTimeField", () => {
  it("renders its calendar in the admin's language, not the browser's", async () => {
    const user = userEvent.setup();

    const en = render(field(), { locale: "en" });
    await user.click(screen.getByRole("button", { name: /Sep 21, 2026/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("September 2026");
    expect(screen.getByRole("grid")).toBeInTheDocument();
    en.unmount();

    const th = render(field(), { locale: "th" });
    await user.click(screen.getByRole("button", { name: /2569/ }));
    // Thai month name, and the Buddhist year every other date in the admin
    // is formatted with — the native picker always said 2026 regardless.
    expect(screen.getByRole("dialog")).toHaveTextContent("กันยายน 2569");
    th.unmount();
  });

  it("localizes the weekday headings", async () => {
    const user = userEvent.setup();
    render(field(), { locale: "th" });

    await user.click(screen.getByRole("button", { name: /2569/ }));

    /*
      Derived from Intl rather than written out. Thai weekday names are not
      byte-identical across ICU builds — an earlier version of this test
      hardcoded Node 24's "อา." and failed on CI, whose ICU spells the same
      day "อาทิตย์". What matters is that the headings come from the admin's
      locale, which the th/en comparison below is what actually proves.
    */
    const thai = new Intl.DateTimeFormat("th-TH", { weekday: "narrow" });
    const sunday = thai.format(new Date(2024, 0, 7));
    const thursday = thai.format(new Date(2024, 0, 11));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(sunday);
    expect(dialog).toHaveTextContent(thursday);
    // …and that they are not the English ones.
    expect(sunday).not.toBe(new Intl.DateTimeFormat("en-US", { weekday: "narrow" }).format(new Date(2024, 0, 7)));
  });

  it("submits the value under the same name and format the native input used", () => {
    const { container } = render(field());
    expect(hidden(container)).toHaveValue(VALUE);
  });

  it("keeps the time when a different day is picked", async () => {
    const user = userEvent.setup();
    const { container } = render(field(), { locale: "en" });

    await user.click(screen.getByRole("button", { name: /Sep 21, 2026/ }));
    await user.click(
      within(screen.getByRole("grid")).getByRole("gridcell", { name: /September 24, 2026/ }),
    );

    // The day moved, 13:29 did not.
    expect(hidden(container)).toHaveValue("2026-09-24T13:29");
  });

  it("clears back to empty, which is what 'publish now' means", async () => {
    const user = userEvent.setup();
    const { container } = render(field(), { locale: "en" });

    await user.click(screen.getByRole("button", { name: /Sep 21, 2026/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(hidden(container)).toHaveValue("");
    // And the trigger says so rather than going blank.
    expect(screen.getByRole("button", { name: /Not set/ })).toBeInTheDocument();
  });

  it("opens on an empty value without inventing one", async () => {
    const user = userEvent.setup();
    const { container } = render(field(""), { locale: "en" });

    expect(hidden(container)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /Not set/ }));

    // A calendar to choose from, but nothing chosen on the form's behalf.
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(hidden(container)).toHaveValue("");
  });

  it("opens upward when the field sits too low for the panel to fit below", async () => {
    const user = userEvent.setup();
    render(field(), { locale: "en" });

    const trigger = screen.getByRole("button", { name: /Sep 21, 2026/ });
    // Low on screen: no room under it, plenty over it. jsdom reports zeroes
    // for every rect, so the geometry has to be stated outright.
    trigger.getBoundingClientRect = () => ({ top: 700, bottom: 740 }) as DOMRect;

    await user.click(trigger);

    expect(screen.getByRole("dialog").className).toContain("bottom-full");
  });

  it("stays below when flipping up would not help either", async () => {
    const user = userEvent.setup();
    render(field(), { locale: "en" });

    const trigger = screen.getByRole("button", { name: /Sep 21, 2026/ });
    // Short viewport, cramped both ways — it should pick the roomier side
    // rather than flipping on principle and covering the field.
    trigger.getBoundingClientRect = () => ({ top: 220, bottom: 260 }) as DOMRect;

    await user.click(trigger);

    expect(screen.getByRole("dialog").className).toContain("top-full");
  });

  it("changes the time without touching the day", async () => {
    const user = userEvent.setup();
    const { container } = render(field(), { locale: "en" });

    await user.click(screen.getByRole("button", { name: /Sep 21, 2026/ }));
    await user.selectOptions(screen.getByLabelText("Hour"), "08");
    await user.selectOptions(screen.getByLabelText("Minute"), "05");

    expect(hidden(container)).toHaveValue("2026-09-21T08:05");
  });
});
