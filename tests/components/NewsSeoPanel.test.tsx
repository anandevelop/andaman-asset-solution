/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/NewsSeoPanel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * NewsForm mirrors title/metaTitle/metaDescription/slug/focusKeyword/
 * content into local state purely so this panel has something to react
 * to on every keystroke — this test is what proves that plumbing actually
 * updates the score, checklist and keyword density live, not just once
 * on mount. A harness stands in for NewsForm's own state, the same way
 * MarkdownToolbar.test.tsx stands in for BodyField.
 *
 * The panel debounces its expensive recompute by 300ms (see the file
 * header) — every assertion on score/checklist/stats below goes through
 * waitFor() rather than reading the DOM immediately after an interaction.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Role } from "@prisma/client";
import NewsSeoPanel, { type NewsSeoPanelValues } from "@/components/admin/NewsSeoPanel";
import type { ArticleLinkPanel } from "@/lib/admin/link-opportunities";
import { render, screen, waitFor } from "./render";

// keyword-lsi-actions.ts and seo/links/actions.ts are both "use server"
// files — Next.js compiles them into an RPC stub at build time, but
// vitest has no such transform, so a component's real "use server" import
// breaks under test with no mock in place (the same reason no other
// component that imports a server action directly, e.g.
// InternalLinkModal.tsx, has a unit test of its own).
const { getKeywordForPhrase, upsertLsiTerms, addLinkOpportunity } = vi.hoisted(() => ({
  getKeywordForPhrase: vi.fn(),
  upsertLsiTerms: vi.fn(),
  addLinkOpportunity: vi.fn(),
}));

vi.mock("@/app/[locale]/admin/(content)/news/keyword-lsi-actions", () => ({
  getKeywordForPhrase,
  upsertLsiTerms,
}));

vi.mock("@/app/[locale]/admin/(growth)/seo/links/actions", () => ({
  addLinkOpportunity,
}));

// This panel's cover-image field is an ImageUploader, which registers
// every upload into the Media table and offers a "choose from library"
// picker — both reach the same "use server" media/actions.ts this panel
// never otherwise touches, so every export it has to have needs a stub
// here too, same reasoning as the two mocks above.
const { createMedia, fetchMediaLibrary, updateMediaMeta, deleteMedia, getMediaUsage } = vi.hoisted(() => ({
  createMedia: vi.fn(),
  fetchMediaLibrary: vi.fn(),
  updateMediaMeta: vi.fn(),
  deleteMedia: vi.fn(),
  getMediaUsage: vi.fn(),
}));

vi.mock("@/app/[locale]/admin/(content)/media/actions", () => ({
  createMedia,
  fetchMediaLibrary,
  updateMediaMeta,
  deleteMedia,
  getMediaUsage,
}));

// useRouter() throws "invariant expected app router to be mounted" with no
// real App Router above it — the panel only ever calls .refresh(), so a
// spy is all router.refresh() in the Add-link flow needs.
const routerRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

beforeEach(() => {
  getKeywordForPhrase.mockReset().mockResolvedValue(null);
  upsertLsiTerms.mockReset().mockResolvedValue({ ok: true });
  addLinkOpportunity.mockReset().mockResolvedValue({ ok: true });
  routerRefresh.mockReset();
});

const EMPTY_LINK_PANEL: ArticleLinkPanel = { opportunities: [], inboundLinks: [], externalStatuses: {} };

const BASE_VALUES: NewsSeoPanelValues = {
  title: "",
  metaTitle: "",
  metaDescription: "",
  slug: "",
  excerpt: "",
  focusKeyword: "",
  content: "",
  coverImageUrl: "",
  ogImageUrl: "",
  schemaType: "NewsArticle",
  canonicalUrl: "",
  secondaryKeywords: "",
};

function Harness({
  initial = BASE_VALUES,
  role = Role.ADMIN,
  linkPanel = EMPTY_LINK_PANEL,
}: {
  initial?: NewsSeoPanelValues;
  role?: Role;
  linkPanel?: ArticleLinkPanel;
}) {
  const [values, setValues] = useState(initial);

  return (
    <NewsSeoPanel
      lang="en"
      languageComplete={false}
      contentFormat="MARKDOWN"
      values={values}
      onFocusKeywordChange={(focusKeyword) => setValues((v) => ({ ...v, focusKeyword }))}
      onMetaTitleChange={(metaTitle) => setValues((v) => ({ ...v, metaTitle }))}
      onMetaDescriptionChange={(metaDescription) => setValues((v) => ({ ...v, metaDescription }))}
      onOgImageUrlChange={(ogImageUrl) => setValues((v) => ({ ...v, ogImageUrl }))}
      onSchemaTypeChange={(schemaType) => setValues((v) => ({ ...v, schemaType }))}
      onCanonicalUrlChange={(canonicalUrl) => setValues((v) => ({ ...v, canonicalUrl }))}
      onSecondaryKeywordsChange={(secondaryKeywords) => setValues((v) => ({ ...v, secondaryKeywords }))}
      noIndexDefaultChecked={false}
      role={role}
      uiLocale="en"
      linkPanel={linkPanel}
      addLinkAction={addLinkOpportunity}
    />
  );
}

/** The score donut has no visible "/100" text node any more (it's an SVG
 *  ring) — read it off the accessible name instead, which the component
 *  sets explicitly for exactly this reason. */
function getScore(): number {
  const donut = screen.getByRole("img", { name: /\/100$/ });
  return Number((donut.getAttribute("aria-label") ?? "").replace("/100", ""));
}

describe("NewsSeoPanel — score", () => {
  it("starts at a low score with nothing filled in", async () => {
    render(<Harness />);
    // Not exactly 0: three checks trivially pass on blank content, not
    // because anything is actually good — imageAltText and hasImage's
    // sibling logic (no images to violate), singleH1 (zero H1s), and
    // headingHierarchy (no headings to skip between). "Low", not "zero",
    // is the real claim.
    await waitFor(() => expect(getScore()).toBeLessThan(20));
  });

  it("raises the score as fields that satisfy checks are filled in", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...BASE_VALUES, title: "Beachfront villas in Phuket" }} />);

    await waitFor(() => expect(getScore()).toBeGreaterThanOrEqual(0));
    const before = getScore();

    await user.type(screen.getByLabelText(/Focus keyword/i), "Beachfront villas");

    await waitFor(() => expect(getScore()).toBeGreaterThan(before));
  });
});

describe("NewsSeoPanel — keywords tab", () => {
  it("shows a placeholder with no focus keyword set", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Keywords" }));

    // "Set a focus keyword" is also the start of the LSI section's own
    // no-focus-keyword hint below it — match the density placeholder's
    // full, distinct wording rather than the shared prefix.
    expect(screen.getByText(/see how often it appears in the body/i)).toBeInTheDocument();
  });

  it("counts live occurrences of the focus keyword in the body", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...BASE_VALUES, content: "Phuket villas. More Phuket villas here." }} />);

    // The focus-keyword input lives on the "SEO" tab, active by default —
    // type into it before switching, since the tab panes unmount each other.
    await user.type(screen.getByLabelText(/Focus keyword/i), "Phuket");
    await user.click(screen.getByRole("tab", { name: "Keywords" }));

    await waitFor(() => {
      const row = screen.getByText("Phuket").closest("tr");
      expect(row).not.toBeNull();
      expect(row!.textContent).toContain("2");
    });
  });

  it("has the secondary-keywords field, relocated from the Settings tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Keywords" }));
    expect(screen.getByLabelText(/Secondary keywords/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.queryByLabelText(/Secondary keywords/i)).not.toBeInTheDocument();
  });

  it("shows a tracked keyword's LSI terms once the lookup resolves", async () => {
    getKeywordForPhrase.mockResolvedValue({ id: "kw-1", lsiTerms: ["sea view villa", "pool villa"] });
    const user = userEvent.setup();
    render(<Harness initial={{ ...BASE_VALUES, focusKeyword: "beachfront villas" }} />);

    await user.click(screen.getByRole("tab", { name: "Keywords" }));

    await waitFor(() => {
      expect(getKeywordForPhrase).toHaveBeenCalledWith("beachfront villas", "en");
      expect(screen.getByLabelText(/LSI suggestions/i)).toHaveValue("sea view villa, pool villa");
    });
  });

  it("saves an LSI term through upsertLsiTerms", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...BASE_VALUES, focusKeyword: "beachfront villas" }} />);

    await user.click(screen.getByRole("tab", { name: "Keywords" }));
    await waitFor(() => expect(getKeywordForPhrase).toHaveBeenCalled());

    const input = screen.getByLabelText(/LSI suggestions/i);
    await user.type(input, "sea view villa");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(upsertLsiTerms).toHaveBeenCalledWith("beachfront villas", "en", ["sea view villa"]);
    });
  });
});

describe("NewsSeoPanel — content stats (folded into the SEO tab)", () => {
  it("reflects the live word count", async () => {
    render(<Harness initial={{ ...BASE_VALUES, content: "one two three four five" }} />);

    await waitFor(() => {
      const label = screen.getByText("Words");
      const value = label.parentElement?.querySelector("dd");
      expect(value?.textContent).toBe("5");
    });
  });

  it("shows a heading-order warning when a heading skips a level", async () => {
    // H2 straight to H4, no H3 between — the first heading never skips
    // (nothing precedes it to skip from), so the transition needs a
    // second heading to actually trigger skipsLevel. The checklist's own
    // headingHierarchy row also mentions "skips a level" once this fails,
    // so this query targets the outline-specific wording rather than that
    // shared substring.
    render(<Harness initial={{ ...BASE_VALUES, content: "## Section\n\n#### Too deep" }} />);

    await waitFor(() => expect(screen.getByText(/highlight which/i)).toBeInTheDocument());
  });
});

describe("NewsSeoPanel — checklist grouping", () => {
  it("groups a failing weight-3 check under must-fix", async () => {
    render(<Harness initial={{ ...BASE_VALUES, content: "Too short." }} />);

    await waitFor(() => {
      const mustFix = screen.getByText("Must fix").parentElement;
      expect(mustFix?.textContent).toMatch(/at least 600 words/i);
    });
  });
});

describe("NewsSeoPanel — links tab", () => {
  it("lists the body's own internal and external links live", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{ ...BASE_VALUES, content: "[ours](/projects/x) and [theirs](https://example.com)" }}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Links" }));

    await waitFor(() => {
      expect(screen.getByText("/projects/x")).toBeInTheDocument();
      expect(screen.getByText("https://example.com")).toBeInTheDocument();
    });
  });

  it("shows an empty state with no links in the body", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Links" }));

    expect(screen.getByText(/No links in the body yet/i)).toBeInTheDocument();
  });

  const OPPORTUNITY = {
    id: "opp-1",
    sourceId: "article-1",
    sourceLocale: "en",
    sourceTitle: "This article",
    targetType: "PROJECT" as const,
    targetId: "project-1",
    targetTitle: "Trinity Village",
    targetPath: "/projects/trinity-village",
    matchedText: "Trinity Village",
    weight: 0.8,
  };

  it("lists a should-link-to opportunity and lets an ADMIN add it", async () => {
    const user = userEvent.setup();
    render(<Harness role={Role.ADMIN} linkPanel={{ ...EMPTY_LINK_PANEL, opportunities: [OPPORTUNITY] }} />);

    await user.click(screen.getByRole("tab", { name: "Links" }));
    expect(screen.getByText("Trinity Village")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add link/i }));

    await waitFor(() => {
      expect(addLinkOpportunity).toHaveBeenCalledWith(
        {
          sourceId: "article-1",
          sourceLocale: "en",
          targetType: "PROJECT",
          targetId: "project-1",
          targetPath: "/projects/trinity-village",
        },
        "en",
      );
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  it("hides the add-link button for a non-ADMIN role", async () => {
    const user = userEvent.setup();
    render(<Harness role={Role.EDITOR} linkPanel={{ ...EMPTY_LINK_PANEL, opportunities: [OPPORTUNITY] }} />);

    await user.click(screen.getByRole("tab", { name: "Links" }));

    expect(screen.getByText("Trinity Village")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add link/i })).not.toBeInTheDocument();
  });

  it("shows an inbound link pointing at this article", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        linkPanel={{
          ...EMPTY_LINK_PANEL,
          inboundLinks: [
            {
              fromType: "PROJECT",
              fromId: "p1",
              label: "Trinity Village",
              adminHref: "/admin/projects/p1/edit",
              anchorText: null,
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Links" }));

    expect(screen.getByText(/Links pointing in/i)).toBeInTheDocument();
    expect(screen.getByText("Trinity Village")).toBeInTheDocument();
  });

  it("badges a live external link with its last-checked status", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{ ...BASE_VALUES, content: "[theirs](https://example.com)" }}
        linkPanel={{
          ...EMPTY_LINK_PANEL,
          externalStatuses: { "https://example.com": { status: 404, checkedAt: new Date("2026-01-01") } },
        }}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Links" }));

    await waitFor(() => {
      expect(screen.getByText("https://example.com")).toBeInTheDocument();
      expect(screen.getByText("404")).toBeInTheDocument();
    });
  });
});

describe("NewsSeoPanel — settings tab", () => {
  it("changing the schema type updates the Schema tab's preview", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...BASE_VALUES, title: "Beachfront villas" }} />);

    await user.click(screen.getByRole("tab", { name: "Settings" }));
    await user.selectOptions(screen.getByLabelText(/Schema type/i), "BlogPosting");

    await user.click(screen.getByRole("tab", { name: "Schema" }));

    await waitFor(() => expect(screen.getByText("BlogPosting")).toBeInTheDocument());
  });
});
