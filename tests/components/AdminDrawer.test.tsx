/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/AdminDrawer.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Closing a URL-driven drawer discards its form. A click on the dimmed page
 * beside the panel used to do that silently, half-written entry and all —
 * now it asks once something has been typed, and only then.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));

import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import { messages, render, screen, userEvent } from "./render";

function drawer(props: { onClose?: () => void } = {}) {
  return render(
    <AdminDrawer
      title="Edit award"
      closeHref={props.onClose ? undefined : "/en/admin/awards"}
      onClose={props.onClose}
      closeLabel="Close"
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <input aria-label="Name" />
        <button type="submit">Save</button>
      </form>
    </AdminDrawer>,
  );
}

// Two "Close" controls: the backdrop and the ✕. The backdrop is first.
const backdrop = () => screen.getAllByRole("button", { name: "Close" })[0];

describe("AdminDrawer", () => {
  let confirm: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    replace.mockReset();
    confirm = vi.spyOn(window, "confirm");
  });
  afterEach(() => confirm.mockRestore());

  it("closes without asking when nothing was typed", async () => {
    drawer();
    await userEvent.setup().click(backdrop());

    expect(confirm).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/en/admin/awards", { scroll: false });
  });

  it("asks before the backdrop throws away typed input, and stays open on Cancel", async () => {
    const user = userEvent.setup();
    confirm.mockReturnValue(false);
    drawer();

    await user.type(screen.getByLabelText("Name"), "Half-written");
    await user.click(backdrop());

    expect(confirm).toHaveBeenCalledWith(messages.en.admin.common.closeUnsaved);
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks on Escape too, and closes on OK", async () => {
    const user = userEvent.setup();
    confirm.mockReturnValue(true);
    drawer();

    await user.type(screen.getByLabelText("Name"), "x");
    await user.keyboard("{Escape}");

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("does not ask after the form was submitted", async () => {
    const user = userEvent.setup();
    drawer();

    await user.type(screen.getByLabelText("Name"), "Saved");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(backdrop());

    expect(confirm).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("never asks for a state-driven drawer, whose parent keeps the draft", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    drawer({ onClose });

    await user.type(screen.getByLabelText("Name"), "Draft");
    await user.click(backdrop());

    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
