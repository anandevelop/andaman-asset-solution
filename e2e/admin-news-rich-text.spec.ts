/**
 * e2e/admin-news-rich-text.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rich-text news editor, exercised as a browser actually would: type
 * into a real contenteditable region, apply headings through the toolbar,
 * insert a link through the modal, save. None of this is reachable from a
 * unit test — components/admin/RichTextEditor.tsx wraps a real TipTap/
 * ProseMirror instance, and TipTap's own tests/components/
 * RichTextEditor.test.tsx has to route around jsdom's missing layout APIs
 * (no `elementFromPoint`, no `getClientRects`) to drive it at all. A real
 * browser has none of that trouble, which is exactly why this exists
 * alongside that unit suite rather than instead of it.
 *
 * Uses the manual-URL field in the internal-link modal rather than its
 * search results, so the spec does not depend on a specific fixture
 * project/article existing to search for — the modal's own search is
 * lib/admin/content-link-index.ts's job to get right, unit-tested there.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { nextAccount, signIn } from "./sign-in";

const NEW_ARTICLE = "/en/admin/news/new";

const uniqueTitle = () => `E2E rich text article ${Date.now()}`;

test.describe("The rich-text news editor", () => {
  test("creates an article with H2/H3/H4 headings and an internal link", async ({ page }) => {
    const account = nextAccount();
    const title = uniqueTitle();

    await page.goto("/en/login");
    await signIn(page, account.email);

    await page.goto(NEW_ARTICLE);

    await page.locator('input[name="title"]').fill(title);

    const editor = page.locator('[contenteditable="true"]');
    await editor.click();

    // H2, then Enter starts a fresh (paragraph) line — matching how a
    // real admin moves between heading levels while writing.
    await page.getByRole("button", { name: "Heading 2" }).click();
    await page.keyboard.type("Market overview");
    await page.keyboard.press("Enter");

    await page.getByRole("button", { name: "Heading 3" }).click();
    await page.keyboard.type("Section detail");
    await page.keyboard.press("Enter");

    await page.getByRole("button", { name: "Heading 4" }).click();
    await page.keyboard.type("A finer point");
    await page.keyboard.press("Enter");

    await page.getByRole("button", { name: "Paragraph" }).click();
    await page.keyboard.type("Body copy long enough to read as a real paragraph.");

    // Select the paragraph's text so the link modal has something to
    // attach the link to.
    await page.keyboard.press("Home");
    await page.keyboard.down("Shift");
    await page.keyboard.press("End");
    await page.keyboard.up("Shift");

    await page.getByRole("button", { name: "Insert link (⌘K)" }).click();
    await expect(page.getByRole("dialog", { name: "Insert internal link" })).toBeVisible();

    await page.locator("#link-manual-url").fill("/projects/andaman-bay");
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Create", exact: true }).click();

    // createArticle() redirects to the edit page with ?created=1 on
    // success — the same idiom this repo's other content-creation specs
    // assert on, not the toast (which self-dismisses).
    await expect(page).toHaveURL(/\/admin\/news\/[^/]+\/edit\?created=1/);

    // The heading levels and the link both round-tripped through save →
    // sanitizeArticleHtml() → reload, not just the in-memory editor state.
    await expect(page.getByRole("heading", { name: "Market overview", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Section detail", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A finer point", level: 4 })).toBeVisible();
    await expect(page.locator('a[href="/projects/andaman-bay"]')).toHaveCount(1);
  });
});
