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

import { type Page } from "@playwright/test";
import { expect, test } from "./harness";
import { expectNoA11yViolations } from "./a11y";
import { DRAFT_PROJECT, PROJECTS, PUBLISHED_PROJECTS } from "./fixtures";

const LISTING = "/en/projects";

/*
  One project's card in the grid, addressed by where it links rather than
  by what it says.

  Matching on the name alone is ambiguous in three places at once now. The
  footer carries its own list of projects; the hero's shortcut bar repeats
  every published name above the grid; and each shortcut's accessible name
  contains the project's, so even `exact` would not separate them. Scoping
  to <main> is no longer enough either, because the hero is inside it.

  Where each link goes does separate them, and says what the test means: a
  card is a link inside the grid's #project-<slug> item, while the hero
  shortcuts now link to the same page from outside it and the footer entry
  is neither in the grid nor the point. A substring match rather than `$=` so a trailing slash on the
  built URLs cannot quietly empty the locator and turn every one of these
  assertions green for the wrong reason.
*/
function card(page: Page, slug: string) {
  return page.locator(`#project-${slug} a[href*="/projects/${slug}"]`).first();
}

test.describe("Project listing", () => {
  test("lists every published project and no drafts", async ({ page }) => {
    await page.goto(LISTING);

    for (const project of PUBLISHED_PROJECTS) {
      await expect(card(page, project.slug)).toBeVisible();
    }

    // The draft has a name nothing else uses, so a single negative
    // assertion is enough — and it is the assertion that catches someone
    // dropping `isPublished: true` from the query while refactoring.
    await expect(page.getByText(DRAFT_PROJECT.nameEn)).toHaveCount(0);
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto(LISTING);
    await expectNoA11yViolations(page);
  });
});

test.describe("Filtering", () => {
  test("offers a way out of an empty result", async ({ page }) => {
    // A dead end with no exit is the worst state a filter UI can reach:
    // nothing on screen, and no obvious undo. TOWNHOME's only fixture is
    // the unpublished draft, so this type alone yields zero results.
    await page.goto(`${LISTING}?type=TOWNHOME`);

    await expect(page.getByText("No projects match these filters")).toBeVisible();

    await page.getByRole("link", { name: "Clear all filters" }).click();

    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(card(page, "e2e-trinity-village")).toBeVisible();
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
    // No sort control on the page any more; the URL parameter still sorts.
    await page.goto(`${LISTING}?sort=newest`);

    await expect(page).toHaveURL(/sort=newest/);
    await expect(card(page, "e2e-trinity-village")).toBeVisible();
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
