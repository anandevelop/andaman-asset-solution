/**
 * tests/lib/admin/keyword-library.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * buildTopicClusters() and selectPillar() are the pure logic behind the
 * keyword library's topic-cluster feature (lib/admin/keyword-library.ts's
 * header) — exercised directly against hand-built fixtures, no Prisma,
 * per this project's convention that DB-touching orchestration isn't
 * unit-tested (getKeywordLibrary() itself is covered by the manual
 * browser pass instead).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { buildTopicClusters, selectPillar } from "@/lib/admin/keyword-library";
import type { ResolvedContentRef } from "@/lib/admin/content-link-index";

function ref(overrides: Partial<ResolvedContentRef> & Pick<ResolvedContentRef, "contentId">): ResolvedContentRef {
  return {
    contentType: "NEWS_ARTICLE",
    locale: "en",
    title: overrides.contentId,
    path: `/news/${overrides.contentId}`,
    status: "published",
    ...overrides,
  };
}

describe("buildTopicClusters", () => {
  it("groups two pieces of content that share a keyword", () => {
    const clusters = buildTopicClusters([
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "a", locale: "en" },
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "b", locale: "en" },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].nodes.map((n) => n.contentId).sort()).toEqual(["a", "b"]);
    expect(clusters[0].keywordIds).toEqual(new Set(["kw-1"]));
  });

  it("joins a third node transitively through a different shared keyword", () => {
    const clusters = buildTopicClusters([
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "a", locale: "en" },
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "b", locale: "en" },
      { keywordId: "kw-2", contentType: "NEWS_ARTICLE", contentId: "b", locale: "en" },
      { keywordId: "kw-2", contentType: "PROJECT", contentId: "c", locale: "en" },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].nodes.map((n) => n.contentId).sort()).toEqual(["a", "b", "c"]);
    expect(clusters[0].keywordIds).toEqual(new Set(["kw-1", "kw-2"]));
  });

  it("keeps unrelated keyword groups as separate clusters", () => {
    const clusters = buildTopicClusters([
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "a", locale: "en" },
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "b", locale: "en" },
      { keywordId: "kw-9", contentType: "NEWS_ARTICLE", contentId: "x", locale: "en" },
      { keywordId: "kw-9", contentType: "NEWS_ARTICLE", contentId: "y", locale: "en" },
    ]);

    expect(clusters).toHaveLength(2);
  });

  it("discards a node with no one else sharing its keyword", () => {
    const clusters = buildTopicClusters([{ keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "a", locale: "en" }]);
    expect(clusters).toEqual([]);
  });

  it("treats the same content in two different locales as two distinct nodes", () => {
    const clusters = buildTopicClusters([
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "a", locale: "en" },
      { keywordId: "kw-1", contentType: "NEWS_ARTICLE", contentId: "a", locale: "th" },
    ]);

    // Two distinct (contentId, locale) nodes sharing a keyword still form
    // a real 2-member cluster — locale is part of the node's identity.
    expect(clusters).toHaveLength(1);
    expect(clusters[0].nodes).toHaveLength(2);
  });
});

describe("selectPillar", () => {
  const a = ref({ contentId: "a", path: "/news/a" });
  const b = ref({ contentId: "b", path: "/news/b" });
  const c = ref({ contentId: "c", path: "/news/c" });

  it("picks the member with the most intra-cluster inbound links", () => {
    const links = [
      { fromType: "NEWS_ARTICLE", fromId: "a", toPath: "/news/b", isInternal: true },
      { fromType: "NEWS_ARTICLE", fromId: "c", toPath: "/news/b", isInternal: true },
    ];
    const { pillar, pillarInboundLinks } = selectPillar([a, b, c], links);
    expect(pillar?.contentId).toBe("b");
    expect(pillarInboundLinks).toBe(2);
  });

  it("ignores a link from outside the cluster", () => {
    const links = [{ fromType: "NEWS_ARTICLE", fromId: "outsider", toPath: "/news/b", isInternal: true }];
    const { pillar } = selectPillar([a, b, c], links);
    expect(pillar).toBeNull();
  });

  it("ignores a link to a page outside the cluster", () => {
    const links = [{ fromType: "NEWS_ARTICLE", fromId: "a", toPath: "/news/outside", isInternal: true }];
    const { pillar } = selectPillar([a, b, c], links);
    expect(pillar).toBeNull();
  });

  it("ignores an external link even if the path happens to match", () => {
    const links = [{ fromType: "NEWS_ARTICLE", fromId: "a", toPath: "/news/b", isInternal: false }];
    const { pillar } = selectPillar([a, b, c], links);
    expect(pillar).toBeNull();
  });

  it("returns null with no members", () => {
    expect(selectPillar([], [])).toEqual({ pillar: null, pillarInboundLinks: 0 });
  });

  it("breaks a tie by contentId, deterministically", () => {
    const links = [
      { fromType: "NEWS_ARTICLE", fromId: "a", toPath: "/news/b", isInternal: true },
      { fromType: "NEWS_ARTICLE", fromId: "a", toPath: "/news/c", isInternal: true },
    ];
    const { pillar } = selectPillar([a, b, c], links);
    expect(pillar?.contentId).toBe("b"); // "b" < "c"
  });
});
