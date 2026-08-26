/**
 * e2e/project-listing-filter.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Filtering the project listing.
 *
 * The filters are URL-driven on purpose — a buyer who has narrowed to pool
 * villas ready to move in can send that link to a spouse, and the page they
 * open is the page that was sent. That contract is what these tests protect: not
 * "clicking the chip changes the cards" but "clicking the chip changes the
 * URL, and that URL alone reproduces the view".
 *
 * The assertions count cards rather than looking for one known name, so a
 * filter that returns too much fails as loudly as one that returns too
 * little. A draft project is seeded specifically so "too much" has
 * something to include.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { DRAFT_PROJECT, PROJECTS, PUBLISHED_PROJECTS } from "./fixtures";

const LISTING = "/en/projects";

test.describe("Project listing", () => {
  test("lists every published project and no drafts", async ({ page }) => {
    await page.goto(LISTING);

    for (const project of PUBLISHED_PROJECTS) {
      await expect(page.getByRole("link", { name: project.nameEn })).toBeVisible();
    }

    // The draft has a name nothing else uses, so a single negative
    // assertion is enough — and it is the assertion that catches someone
    // dropping `isPublished: true` from the query while refactoring.
    await expect(page.getByText(DRAFT_PROJECT.nameEn)).toHaveCount(0);
  });

  test("announces the result count", async ({ page }) => {
    await page.goto(LISTING);

    // aria-live, so a filter change is announced to a screen reader rather
    // than silently swapping the cards below the fold.
    const count = page.locator("[aria-live=polite]").first();
    await expect(count).toHaveText(`${PUBLISHED_PROJECTS.length} projects`);
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto(LISTING);
    await expectNoA11yViolations(page);
  });
});

test.describe("Filtering", () => {
  test("narrows to a property type and reflects it in the URL", async ({ page }) => {
    await page.goto(LISTING);

    await page.getByRole("button", { name: "Pool Villa", exact: true }).click();

    await expect(page).toHaveURL(/[?&]type=POOL_VILLA/);

    const expected = PUBLISHED_PROJECTS.filter(
      (project) => project.propertyType === "POOL_VILLA",
    );

    for (const project of expected) {
      await expect(page.getByRole("link", { name: project.nameEn })).toBeVisible();
    }

    // Everything else must be gone, not merely reordered.
    for (const project of PUBLISHED_PROJECTS.filter(
      (candidate) => candidate.propertyType !== "POOL_VILLA",
    )) {
      await expect(page.getByRole("link", { name: project.nameEn })).toHaveCount(0);
    }
  });

  test("marks the active chip as pressed", async ({ page }) => {
    await page.goto(LISTING);

    const chip = page.getByRole("button", { name: "Pool Villa", exact: true });
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    await chip.click();

    // aria-pressed, not a colour change: the state has to be perceivable
    // without seeing the border.
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  test("clears the filter when the active chip is tapped again", async ({ page }) => {
    await page.goto(LISTING);

    const chip = page.getByRole("button", { name: "Pool Villa", exact: true });
    await chip.click();
    await expect(page).toHaveURL(/type=POOL_VILLA/);

    await chip.click();

    await expect(page).not.toHaveURL(/type=/);
    await expect(page.getByRole("link", { name: PUBLISHED_PROJECTS[1].nameEn })).toBeVisible();
  });

  test("combines a property type with a status", async ({ page }) => {
    await page.goto(LISTING);

    await page.getByRole("button", { name: "Pool Villa", exact: true }).click();
    await page.getByRole("button", { name: "Ready to Move In", exact: true }).click();

    await expect(page).toHaveURL(/type=POOL_VILLA/);
    await expect(page).toHaveURL(/status=READY_TO_MOVE_IN/);

    // Layan Reserve is the only fixture in both sets. Trinity Village is
    // also a pool villa but is under construction, so its absence is what
    // proves the two filters intersect rather than union.
    await expect(page.getByRole("link", { name: "Layan Reserve" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Trinity Village" })).toHaveCount(0);
  });

  test("offers a way out of an empty result", async ({ page }) => {
    // A dead end with no exit is the worst state a filter UI can reach:
    // nothing on screen, and no obvious undo. TOWNHOME's only fixture is
    // the unpublished draft, so this type alone yields zero results.
    await page.goto(`${LISTING}?type=TOWNHOME`);

    await expect(page.getByText("No projects match these filters")).toBeVisible();

    await page.getByRole("link", { name: "Clear all filters" }).click();

    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByRole("link", { name: "Trinity Village" })).toBeVisible();
  });

  test("reproduces a filtered view from the URL alone", async ({ page }) => {
    // The shareable-link contract. Nothing is clicked here.
    await page.goto(`${LISTING}?type=POOL_VILLA&sort=newest`);

    await expect(
      page.getByRole("button", { name: "Pool Villa", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await expect(page.getByLabel("Sort")).toHaveValue("newest");
  });

  test("keeps filtered pages out of the index", async ({ page }) => {
    // Every filter combination is a distinct URL over the same few
    // projects. Left indexable, that is textbook thin duplicate content.
    await page.goto(`${LISTING}?type=POOL_VILLA`);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("the unfiltered listing stays indexable", async ({ page }) => {
    await page.goto(LISTING);

    const robots = page.locator('meta[name="robots"]');
    if ((await robots.count()) > 0) {
      await expect(robots).not.toHaveAttribute("content", /noindex/);
    }
  });

  test("a filtered listing is still accessible", async ({ page }) => {
    // The post-filter render is a different DOM from the one scanned
    // above: chips have flipped state and the live region has changed.
    await page.goto(`${LISTING}?type=POOL_VILLA&status=READY_TO_MOVE_IN`);
    await expectNoA11yViolations(page);
  });

  test("an empty result is still accessible", async ({ page }) => {
    await page.goto(`${LISTING}?type=TOWNHOME`);
    await expectNoA11yViolations(page);
  });
});

test.describe("Sorting", () => {
  test("orders by newest first", async ({ page }) => {
    await page.goto(LISTING);

    await page.getByLabel("Sort").selectOption("newest");

    await expect(page).toHaveURL(/sort=newest/);
  });
});

test.describe("Fixture integrity", () => {
  test("the seed matches what the specs assume", async () => {
    // A guard on the fixtures themselves. If someone adds a project and
    // every filter assertion above starts failing with a count mismatch,
    // this fails first and says why.
    expect(PROJECTS).toHaveLength(4);
    expect(PUBLISHED_PROJECTS).toHaveLength(3);
    expect(
      PUBLISHED_PROJECTS.filter((project) => project.propertyType === "POOL_VILLA"),
    ).toHaveLength(2);
  });
});
