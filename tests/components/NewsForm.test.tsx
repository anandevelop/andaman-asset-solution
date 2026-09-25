/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/NewsForm.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Focus mode (§7.2) and the rich-text word count (§7.3).
 *
 * The one property worth a test rather than an eye is that focus mode
 * *hides* the SEO panel instead of unmounting it. §7.2 says so and gives
 * the reason: the publish gate (§3.5) reads the score that panel computes
 * and reports through onSeoResultChange. Unmount it and the gate stops
 * being told anything — it keeps whatever it last heard, or on a fresh load
 * hears nothing at all, which is the state that lets an article through.
 * Nothing about that is visible on screen: the panel is invisible either
 * way, and the difference only shows up in whether publishing is still
 * gated.
 *
 * The mocks below are the same set NewsSeoPanel.test.tsx needs and for the
 * same reason — every "use server" module a rendered component imports has
 * no RPC stub under vitest.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import NewsForm, { EMPTY_ARTICLE } from "@/components/admin/NewsForm";
import type { ArticleLinkPanel } from "@/lib/admin/link-opportunities";
import { draftKey } from "@/lib/admin/news-draft";
import { render, screen, userEvent, waitFor } from "./render";

const { getKeywordForPhrase, upsertLsiTerms, addLinkOpportunity } = vi.hoisted(() => ({
  getKeywordForPhrase: vi.fn(),
  upsertLsiTerms: vi.fn(),
  addLinkOpportunity: vi.fn(),
}));
vi.mock("@/app/[locale]/admin/(content)/news/keyword-lsi-actions", () => ({
  getKeywordForPhrase,
  upsertLsiTerms,
}));
vi.mock("@/app/[locale]/admin/(growth)/seo/links/actions", () => ({ addLinkOpportunity }));

const { createMedia, fetchMediaLibrary, updateMediaMeta, deleteMedia, getMediaUsage } = vi.hoisted(
  () => ({
    createMedia: vi.fn(),
    fetchMediaLibrary: vi.fn(),
    updateMediaMeta: vi.fn(),
    deleteMedia: vi.fn(),
    getMediaUsage: vi.fn(),
  }),
);
vi.mock("@/app/[locale]/admin/(content)/media/actions", () => ({
  createMedia,
  fetchMediaLibrary,
  updateMediaMeta,
  deleteMedia,
  getMediaUsage,
}));

// InternalLinkModal's search is another "use server" module, and it is in
// this tree where it is not in NewsSeoPanel's.
const searchInternalLinks = vi.hoisted(() => vi.fn());
vi.mock("@/app/[locale]/admin/content-link-search-actions", () => ({ searchInternalLinks }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  getKeywordForPhrase.mockReset().mockResolvedValue(null);
  upsertLsiTerms.mockReset().mockResolvedValue({ ok: true });
  addLinkOpportunity.mockReset().mockResolvedValue({ ok: true });
  fetchMediaLibrary.mockReset().mockResolvedValue({ items: [] });
  searchInternalLinks.mockReset().mockResolvedValue([]);
  window.localStorage.clear();
});

const EMPTY_LINK_PANEL: ArticleLinkPanel = {
  opportunities: [],
  inboundLinks: [],
  externalStatuses: {},
};

function renderForm(
  content = "<p>One two three four five.</p>",
  extra: { articleId?: string; serverUpdatedAt?: string } = {},
) {
  return render(
    <NewsForm
      locale="en"
      lang="en"
      action={async (state) => state}
      values={{ ...EMPTY_ARTICLE, title: "A title", slug: "a-title", content }}
      categories={[]}
      submitLabel="Save"
      languageComplete={false}
      role={Role.ADMIN}
      linkPanel={EMPTY_LINK_PANEL}
      addLinkAction={addLinkOpportunity}
      headerTitle="Edit article"
      backHref="/en/admin/news"
      backLabel="Back"
      {...extra}
    />,
  );
}

/** The SEO panel's checklist heading — present whenever it is mounted. */
function seoPanel(): HTMLElement | null {
  return screen.queryByText("SEO checklist");
}

/** The counter that §7.3 adds beside the body's locale label. */
function bodyCounterText(): string {
  const label = screen.getByText("EN", { selector: 'label[for="rich-text-body"]' });
  return label.parentElement?.textContent ?? "";
}

describe("NewsForm — focus mode", () => {
  it("starts off, and the SEO panel is visible", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /Focus mode/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("hides the SEO panel without unmounting it, so the publish gate keeps being told", async () => {
    const user = userEvent.setup();
    renderForm();

    const panel = seoPanel();
    expect(panel).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Focus mode/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Exit focus mode/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );

    // Still mounted — this is the whole point. `hidden` is on an ancestor.
    expect(seoPanel()).toBeInTheDocument();
    expect(seoPanel()?.closest("div.hidden")).not.toBeNull();
  });

  it("remembers the choice for the next article", async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm();

    await user.click(screen.getByRole("button", { name: /Focus mode/i }));
    await waitFor(() =>
      expect(window.localStorage.getItem("andaman.news.focusMode")).toBe("1"),
    );

    unmount();
    renderForm();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Exit focus mode/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });
});

describe("NewsForm — rich-text word count (§7.3)", () => {
  it("shows words and reading time beside the body label", () => {
    renderForm("<p>One two three four five.</p>");
    // Five words, from the same getContentStats the SEO panel uses.
    expect(bodyCounterText()).toMatch(/5 words/i);
  });

  it("counts the text and not the markup", () => {
    renderForm('<p>One <strong>two</strong> <a href="/x">three</a></p>');
    expect(bodyCounterText()).toMatch(/3 words/i);
  });
});

/*
  §7.1's draft recovery. The rule it enforces is that nothing is ever put
  back without being asked for — a draft that reinstates itself can
  overwrite an edit made elsewhere in between, or bring back text its
  author deleted on purpose and saved.
*/
describe("NewsForm — recovering an unsaved draft", () => {
  const SERVER_SAVED_AT = "2026-01-01T00:00:00.000Z";

  function storeDraft(content: string, savedAt = "2026-01-02T00:00:00.000Z") {
    window.localStorage.setItem(
      draftKey("article-1", "en"),
      JSON.stringify({
        savedAt,
        values: {
          title: "A title",
          slug: "a-title",
          content,
          metaTitle: "",
          metaDescription: "",
          focusKeyword: "",
        },
      }),
    );
  }

  it("offers a newer draft rather than applying it", async () => {
    storeDraft("<p>Work that was never saved.</p>");
    renderForm("<p>One two three four five.</p>", {
      articleId: "article-1",
      serverUpdatedAt: SERVER_SAVED_AT,
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recover" })).toBeInTheDocument(),
    );
    // The body still holds the server's text, not the draft's.
    expect(document.querySelector(".ProseMirror")?.textContent ?? "").toContain("One two three");
    expect(document.querySelector(".ProseMirror")?.textContent ?? "").not.toContain("never saved");
  });

  it("puts the draft back when asked", async () => {
    const user = userEvent.setup();
    storeDraft("<p>Work that was never saved.</p>");
    renderForm("<p>One two three four five.</p>", {
      articleId: "article-1",
      serverUpdatedAt: SERVER_SAVED_AT,
    });

    await user.click(await screen.findByRole("button", { name: "Recover" }));

    await waitFor(() =>
      expect(document.querySelector(".ProseMirror")?.textContent ?? "").toContain("never saved"),
    );
    expect(screen.queryByRole("button", { name: "Recover" })).not.toBeInTheDocument();
  });

  it("forgets the draft when discarded", async () => {
    const user = userEvent.setup();
    storeDraft("<p>Work that was never saved.</p>");
    renderForm("<p>One two three four five.</p>", {
      articleId: "article-1",
      serverUpdatedAt: SERVER_SAVED_AT,
    });

    await user.click(await screen.findByRole("button", { name: "Discard" }));

    expect(screen.queryByRole("button", { name: "Recover" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey("article-1", "en"))).toBeNull();
  });

  it("says nothing when the stored draft is what was saved", async () => {
    storeDraft("<p>One two three four five.</p>");
    renderForm("<p>One two three four five.</p>", {
      articleId: "article-1",
      serverUpdatedAt: SERVER_SAVED_AT,
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByRole("button", { name: "Recover" })).not.toBeInTheDocument();
  });

  it("says nothing on a new article, which has no id to key a draft by", async () => {
    storeDraft("<p>Work that was never saved.</p>");
    renderForm();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByRole("button", { name: "Recover" })).not.toBeInTheDocument();
  });
});
