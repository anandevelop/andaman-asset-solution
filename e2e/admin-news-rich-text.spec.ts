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
const uniqueSlug = () => `e2e-rich-text-article-${Date.now()}`;

test.describe("The rich-text news editor", () => {
  test("creates an article with H2/H3/H4 headings and an internal link", async ({ page }) => {
    const account = nextAccount();
    const title = uniqueTitle();

    await page.goto("/en/login");
    await signIn(page, account.email);

    await page.goto(NEW_ARTICLE);

    await page.locator('input[name="title"]').fill(title);
    // The slug field never auto-fills from the title — SlugField.tsx only
    // normalizes what's typed directly into it — and it's `required`, so
    // an admin (and this test) has to set one explicitly.
    await page.locator('input[name="slug"]').fill(uniqueSlug());

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
    // attach the link to. Home/Shift+End does not move the caret at all
    // in this ProseMirror contenteditable region — verified directly:
    // the native browser selection never changes, so the "Insert" button
    // stays disabled forever waiting on anchor text that never arrives.
    // A triple-click, the way a real reader selects a paragraph, works
    // reliably where the keyboard approach did not — matched by text
    // rather than `.last()`, since the document keeps a trailing empty
    // paragraph after this one.
    await editor.getByText("Body copy long enough to read as a real paragraph.").click({ clickCount: 3 });

    await page.getByRole("button", { name: "Insert link (⌘K)" }).click();
    await expect(page.getByRole("dialog", { name: "Insert internal link" })).toBeVisible();

    await page.locator("#link-manual-url").fill("/projects/andaman-bay");
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Two "Create" buttons exist since the workflow header refactor put
    // one at the top of the page alongside the one at the bottom of the
    // form — see the same fix in admin-activity.spec.ts.
    await page.getByRole("button", { name: "Create", exact: true }).first().click();

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
