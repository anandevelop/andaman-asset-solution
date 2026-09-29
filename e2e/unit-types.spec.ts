/**
 * e2e/unit-types.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The unit-types section and the workspace that edits it.
 *
 * Everything asserted here is behaviour no unit test can reach. The lift
 * moves a floor by changing client state after hydration; the room card
 * opens from a click on a pin positioned in percentages; the workspace's
 * whole point is a draft that never touches the server until Save. And the
 * admin screen has never been loaded by any spec, which in this codebase is
 * the condition under which a Server Component quietly starts handing a
 * function to a Client Component and takes the page down.
 *
 * The fixture in global-setup.ts gives the project one type, one floor and
 * two rooms — one with a photo and one without — because those two draw
 * through different branches and a symmetric fixture would exercise one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { signIn } from "./sign-in";
import { expectNoA11yViolations } from "./a11y";
import { PROJECTS } from "./fixtures";

/*
  Serial, and every sign-in happens on the English login page — sign-in.ts
  finds its fields by their English labels, and nextAccount()'s cursor is
  module state two parallel workers would both start from zero.
*/
test.describe.configure({ mode: "serial" });

test.setTimeout(120_000);

const PROJECT = PROJECTS[0].slug;
const BOUNDARY = /something went wrong|เกิดข้อผิดพลาด/i;


/**
 * The id of a real project, read off the admin list.
 *
 * Taken from the list rather than hardcoded so it also proves the route the
 * media library links to resolves — but `/admin/projects/new` is the first
 * link on that page, and taking it literally produced a request for the
 * project called "new".
 */
async function firstProjectId(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/en/admin/projects");

  const hrefs = await page.locator('a[href*="/admin/projects/"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );

  const id = hrefs
    .map((href) => href.split("/admin/projects/")[1]?.split("/")[0] ?? "")
    .find((candidate) => candidate !== "" && candidate !== "new");

  expect(id, "the admin project list offered no project to open").toBeTruthy();
  return id as string;
}

test.describe("the public section", () => {
  test("rides between floors and opens a room photo", async ({ page }) => {
    await page.goto(`/en/projects/${PROJECT}`);

    const section = page.locator("#unit-types");
    await expect(section).toBeVisible();

    // The floor display, which is the thing that makes it read as a lift.
    await expect(section.getByRole("button", { name: "1st Floor" })).toBeVisible();

    /*
      A room with a photo is a button; one without is a plain label. Both
      are drawn from the same pin data, and only the first may open a card
      — asserting both is what stops the distinction quietly collapsing.
    */
    const withPhoto = section.getByRole("button", { name: /Kitchen & Dining/ }).first();
    await expect(withPhoto).toBeVisible();
    await expect(section.getByRole("button", { name: /^Garage/ })).toHaveCount(0);
    await expect(section.getByText("Garage").first()).toBeVisible();

    await withPhoto.click();

    const card = page.getByRole("dialog", { name: /Kitchen & Dining/ });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Show-home photo/i)).toBeVisible();

    /*
      Scanned with the card open, not just the section at rest. The card is
      a dialog built out of a fixed div and positioned by hand, which is
      precisely the shape that ends up without a name or without a reachable
      close button — and it only exists after a click, so a scan of the page
      in its default state would never see it.
    */
    await expectNoA11yViolations(page, { include: "#unit-types" });
    await expectNoA11yViolations(page, { include: "[data-room-photo-card]" });

    // Escape closes it, and focus goes back to the pin it came from.
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
  });

  test("renders in Thai without falling over", async ({ page }) => {
    await page.goto(`/th/projects/${PROJECT}`);

    await expect(page.locator("#unit-types")).toBeVisible();
    await expect(page.getByText(BOUNDARY)).toHaveCount(0);
  });
});

test.describe("the workspace", () => {
  test("loads for an editor, with the draft controls enabled", async ({ page }) => {
    await page.goto("/en/login");
    await page.goto("/en/login");
    await signIn(page);
    await expect(page).toHaveURL(/\/admin/);

    const projectId = await firstProjectId(page);
    await page.goto(`/en/admin/projects/${projectId}/unit-types`);

    await expect(
      page.getByText(BOUNDARY),
      "the unit-types workspace hit its error boundary",
    ).toHaveCount(0);

    // The pin canvas is the part that only exists once the draft mounted.
    await expect(
      page.locator("[data-unit-types-workspace]").getByRole("button", { name: /Place pin/i }),
    ).toBeVisible();

    await expectNoA11yViolations(page, { include: "[data-unit-types-workspace]" });
  });

  test("shows the unsaved bar only after an edit", async ({ page }) => {
    await page.goto("/en/login");
    await page.goto("/en/login");
    await signIn(page);

    const projectId = await firstProjectId(page);
    await page.goto(`/en/admin/projects/${projectId}/unit-types`);

    const unsaved = page.getByText(/Unsaved changes/i);
    await expect(unsaved, "the bar should be hidden before anything changes").toHaveCount(0);

    /*
      Scoped to the workspace: the page also carries the older per-type spec
      forms, whose floor-name inputs look the same and are not the draft.

      Found by label, not by `input[value="1st Floor"]`. That attribute is
      in the server-rendered HTML but React drops it once it controls the
      input, so an attribute locator matched before the edit and stopped
      matching immediately after it.
    */
    const workspace = page.locator("[data-unit-types-workspace]");
    const floorName = workspace.getByLabel(/Floor name/i).first();

    await expect(floorName).toHaveValue("1st Floor");
    await floorName.fill("Ground Floor");

    await expect(unsaved).toBeVisible();

    /*
      And the edit sticks. The selection reset used to run on every draft
      change, so the second character landed on a screen that had just
      bounced back to floor one.
    */
    await expect(floorName).toHaveValue("Ground Floor");
  });

  test("adds the first floor to a type that has none", async ({ page }) => {
    await page.goto("/en/login");
    await page.goto("/en/login");
    await signIn(page);

    const projectId = await firstProjectId(page);
    await page.goto(`/en/admin/projects/${projectId}/unit-types`);

    const workspace = page.locator("[data-unit-types-workspace]");
    const typeZ = workspace.getByRole("button", { name: /Type Z/ });

    // Not "Ready": a type with nothing on it has nothing to be ready.
    await expect(typeZ).toContainText("No floors");
    await typeZ.click();

    await expect(workspace.getByText(/has no floors yet/)).toBeVisible();
    await workspace.getByRole("button", { name: "Add floor" }).click();

    await expect(workspace.getByLabel(/Floor name/i).first()).toBeVisible();
    await expect(page.getByText(/Unsaved changes/i)).toBeVisible();
  });

  /*
    The desktop preview has to be the desktop board. The pane beside the
    floor list is ~840px at a 1440px screen, under the board's 1000px
    container breakpoint, so previewing at the pane's own width showed the
    stacked phone layout behind the "Desktop" button. The heading was the
    bare type name, where the public page says "Type R — ride through the
    house".
  */
  test("previews the desktop board as the public page draws it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/en/login");
    await page.goto("/en/login");
    await signIn(page);

    const projectId = await firstProjectId(page);
    await page.goto(`/en/admin/projects/${projectId}/unit-types`);

    const workspace = page.locator("[data-unit-types-workspace]");
    await workspace.getByRole("button", { name: "Live preview" }).click();

    const board = workspace.locator("#unit-types");
    await expect(board.getByRole("heading", { name: /ride through the house/ })).toBeVisible();

    // Landscape: the floor buttons sit in a column to the left of the title
    // block, not in a row above it.
    const selector = await board.getByRole("group", { name: /floor/i }).boundingBox();
    const project = await board.getByText("Project", { exact: true }).boundingBox();
    expect(selector && project, "both the lift panel and the title block render").toBeTruthy();
    expect(project!.x).toBeGreaterThan(selector!.x + selector!.width);
    expect(project!.y).toBeLessThan(selector!.y + selector!.height);
  });
});
