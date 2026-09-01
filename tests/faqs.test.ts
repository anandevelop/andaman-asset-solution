/**
 * tests/faqs.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * FAQ grouping and the revalidate endpoint's path allowlist.
 *
 * The allowlist is the interesting one. Without it, a caller holding the
 * shared secret could pass "/" and invalidate every rendered page on the
 * site in a single request — turning a cache-purge endpoint into a
 * denial-of-service lever.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  getFaqs,
  getFaqCategories,
  groupByCategory,
  type Faq,
} from "@/lib/faqs";

/*
  The only boundary stubbed here. Everything below it — pickLocale, the
  translation chain, the Markdown sanitizer — runs for real, because those
  are exactly the parts an FAQ can regress in: an answer that renders as
  escaped source, or a Thai page quietly serving English.

  vi.hoisted lifts the spy with the hoisted vi.mock; a plain const would be
  in its temporal dead zone when the factory runs.
*/
const { faqFindMany } = vi.hoisted(() => ({ faqFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { faq: { findMany: faqFindMany } } }));

beforeEach(() => {
  faqFindMany.mockReset();
});

/** A row shaped like the `select` in lib/faqs.ts. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "faq-1",
  questionEn: "Can a foreigner own a villa?",
  questionTh: "ชาวต่างชาติซื้อวิลล่าได้ไหม",
  answerEn: "Yes, through a **leasehold**.",
  answerTh: "ได้ ผ่าน**สัญญาเช่าระยะยาว**",
  category: "ownership",
  translations: [],
  ...over,
});

const faq = (id: string, category: string | null): Faq => ({
  id,
  question: `Q${id}`,
  answerHtml: `<p>A${id}</p>`,
  answerText: `A${id}`,
  category,
});

describe("groupByCategory", () => {
  it("returns an empty list for no entries", () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it("keeps entries in the order they arrived", () => {
    const [, entries] = groupByCategory([
      faq("1", "ownership"),
      faq("2", "ownership"),
      faq("3", "ownership"),
    ])[0];

    expect(entries.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
  });

  it("groups by category", () => {
    const groups = groupByCategory([
      faq("1", "ownership"),
      faq("2", "payment"),
      faq("3", "ownership"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find(([key]) => key === "ownership")?.[1]).toHaveLength(2);
    expect(groups.find(([key]) => key === "payment")?.[1]).toHaveLength(1);
  });

  it("puts uncategorised entries last", () => {
    // An unlabelled question after three labelled sections reads as
    // "other", which is what it is.
    const groups = groupByCategory([
      faq("1", null),
      faq("2", "ownership"),
      faq("3", null),
    ]);

    expect(groups[groups.length - 1][0]).toBeNull();
  });

  it("handles a single uncategorised group", () => {
    const groups = groupByCategory([faq("1", null), faq("2", null)]);

    expect(groups).toEqual([[null, expect.arrayContaining([])]]);
    expect(groups[0][1]).toHaveLength(2);
  });
});

describe("revalidate path allowlist", () => {
  /*
    Mirrors isAllowedPath in app/api/revalidate/route.ts.

    A copy, not an import, because the route file exports only its HTTP
    handlers — so the two have to be kept in step by hand. Adding a prefix
    there means adding it here, or this suite quietly starts proving
    something about a list nobody ships.
  */
  const ALLOWED_PREFIXES = [
    "",
    "/projects",
    "/progress",
    "/news",
    "/events",
    "/about",
    "/achievements",
    "/contact",
  ];

  const isAllowed = (path: string) => {
    if (path.includes("..") || path.startsWith("//")) return false;
    if (path !== "" && !path.startsWith("/")) return false;

    return ALLOWED_PREFIXES.some((prefix) => {
      // The root entry matches the home page only — as a prefix it would
      // reduce to startsWith("/"), which is true of every absolute path.
      if (prefix === "") return path === "";

      return path === prefix || path.startsWith(`${prefix}/`);
    });
  };

  it.each([
    "",
    "/projects",
    "/projects/trinity-village",
    "/news",
    "/news/an-article",
    "/events/open-house",
    "/progress",
    "/about",
    "/achievements",
    "/contact",
  ])("allows %s", (path) => {
    expect(isAllowed(path)).toBe(true);
  });

  it.each([
    ["traversal", "/projects/../../etc"],
    ["protocol-relative", "//evil.test"],
    ["no leading slash", "projects"],
    ["admin", "/admin"],
    ["admin child", "/admin/leads"],
    ["login", "/login"],
    ["api", "/api/health"],
    ["unknown top level", "/wp-admin"],
  ])("rejects %s", (_name, path) => {
    expect(isAllowed(path)).toBe(false);
  });

  it("does not let a prefix match a longer sibling", () => {
    // "/news-archive" must not pass because "/news" is allowed.
    expect(isAllowed("/news-archive")).toBe(false);
    expect(isAllowed("/projects-internal")).toBe(false);
  });

  it("covers every navigable public route", () => {
    // If a page is worth caching it is worth being able to purge.
    for (const path of ["", "/projects", "/progress", "/news", "/events", "/about", "/contact"]) {
      expect(isAllowed(path), path).toBe(true);
    }
  });
});

/*
  getFaqs and the row mapper had no test at all: the file's coverage stopped
  at groupByCategory, which is the one function in it that never touches a
  database, a locale or the sanitizer.
*/
describe("getFaqs", () => {
  it("serves Thai fields on the Thai locale and English on English", async () => {
    faqFindMany.mockResolvedValue([row()]);

    const [th] = await getFaqs("th");
    expect(th.question).toBe("ชาวต่างชาติซื้อวิลล่าได้ไหม");

    const [en] = await getFaqs("en");
    expect(en.question).toBe("Can a foreigner own a villa?");
  });

  it("falls back to the other language rather than rendering nothing", async () => {
    // A half-translated row is normal while an editor is still working. An
    // empty answer on the live site is not.
    faqFindMany.mockResolvedValue([row({ answerTh: null, questionTh: null })]);

    const [faq] = await getFaqs("th");

    expect(faq.question).toBe("Can a foreigner own a villa?");
    expect(faq.answerText).toContain("leasehold");
  });

  it("prefers a translations row over the base columns", async () => {
    faqFindMany.mockResolvedValue([
      row({
        translations: [
          { locale: "th", question: "คำถามที่แปลแล้ว", answer: "คำตอบที่แปลแล้ว" },
        ],
      }),
    ]);

    const [faq] = await getFaqs("th");

    expect(faq.question).toBe("คำถามที่แปลแล้ว");
    expect(faq.answerText).toBe("คำตอบที่แปลแล้ว");
  });

  it("renders the answer as sanitized HTML and as plain text", async () => {
    // Both shapes are used: the HTML for the page, the text for the
    // FAQPage JSON-LD, where markup would be shown to Google verbatim.
    faqFindMany.mockResolvedValue([row()]);

    const [faq] = await getFaqs("en");

    expect(faq.answerHtml).toContain("<strong>leasehold</strong>");
    expect(faq.answerText).toBe("Yes, through a leasehold.");
    expect(faq.answerText).not.toContain("**");
  });

  it("narrows to the categories a project page asks for", async () => {
    faqFindMany.mockResolvedValue([]);

    await getFaqs("en", { categories: ["ownership", "payment"] });

    expect(faqFindMany.mock.calls[0][0].where).toMatchObject({
      isPublished: true,
      category: { in: ["ownership", "payment"] },
    });
  });

  it.each([
    ["no options at all", undefined],
    ["an empty category list", [] as string[]],
  ])("asks for everything published given %s", async (_label, categories) => {
    // An empty array must not become `category: { in: [] }`, which matches
    // nothing and would empty the home page's FAQ section.
    faqFindMany.mockResolvedValue([]);

    await getFaqs("en", categories ? { categories } : {});

    expect(faqFindMany.mock.calls[0][0].where).toEqual({ isPublished: true });
  });

  it("passes a limit through untouched", async () => {
    faqFindMany.mockResolvedValue([]);

    await getFaqs("en", { take: 4 });

    expect(faqFindMany.mock.calls[0][0].take).toBe(4);
  });

  it("degrades to an empty list when the database is unreachable", async () => {
    // safeQuery's contract, exercised through a real caller: the FAQ
    // section disappears, the page still renders.
    vi.spyOn(console, "error").mockImplementation(() => {});
    faqFindMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("simulated P1001", {
        code: "P1001",
        clientVersion: "5.20.0",
      }),
    );

    await expect(getFaqs("en")).resolves.toEqual([]);
  });
});

describe("getFaqCategories", () => {
  it("drops the null category the admin suggestion list cannot use", async () => {
    faqFindMany.mockResolvedValue([
      { category: "ownership" },
      { category: null },
      { category: "payment" },
    ]);

    await expect(getFaqCategories()).resolves.toEqual(["ownership", "payment"]);
  });

  it("degrades to an empty list when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    faqFindMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("simulated P1001", {
        code: "P1001",
        clientVersion: "5.20.0",
      }),
    );

    await expect(getFaqCategories()).resolves.toEqual([]);
  });
});
