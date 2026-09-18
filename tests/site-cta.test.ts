/**
 * tests/site-cta.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The closing CTA's three decisions: which page shows which block, where a
 * button actually points, and whether an editor's message can be saved.
 *
 * All three are worth pinning down because all three fail quietly. A page
 * that resolves to no block renders a missing section rather than an
 * error; a button whose destination is empty renders as a link to
 * nowhere; and a malformed ICU headline is invisible until it reaches
 * every page of the public site at once.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { CtaLinkKind } from "@prisma/client";
import {
  buildCtaMounts,
  ctaButtonHref,
  ctaPathGroup,
  CTA_PATHS,
  formatCtaMessage,
  type CtaBlock,
  type CtaMount,
} from "@/lib/site-cta";
import { routeMatches } from "@/lib/public-paths";
import { CTA_LINK_KINDS, ctaMessageError, siteCtaBlockSchema } from "@/lib/validations";
import type { SiteSettings } from "@/lib/settings";

const settings = {
  contact: {
    phone: "+66989369542",
    phoneDisplay: "+66 98 936 9542",
    whatsapp: "+66 98 936 9542",
    email: "hello@example.com",
    salesEmail: "sales@example.com",
    address: { th: "", en: "", zh: "", ru: "" },
    officeHours: { th: "", en: "", zh: "", ru: "" },
    mapUrl: "",
  },
} as unknown as SiteSettings;

const links = { locale: "th", settings, whatsappGreeting: "Hello" };

describe("ctaPathGroup", () => {
  it("maps a page to itself", () => {
    expect(ctaPathGroup("/about")).toBe("/about");
    expect(ctaPathGroup("/contact")).toBe("/contact");
  });

  it("folds a detail page into its section", () => {
    // The whole reason placements are per-section: one row for "Projects"
    // has to cover a development published next month.
    expect(ctaPathGroup("/projects/andaman-bay-villa")).toBe("/projects");
    expect(ctaPathGroup("/news/some-article")).toBe("/news");
    expect(ctaPathGroup("/events/open-house")).toBe("/events");
  });

  it("strips the locale first", () => {
    expect(ctaPathGroup("/th/projects/villa")).toBe("/projects");
    expect(ctaPathGroup("/ru/about")).toBe("/about");
    expect(ctaPathGroup("/zh")).toBe("/");
  });

  it("does not let the home page swallow the site", () => {
    // "/" as a prefix would match every path there is, which would make
    // one placement row govern the whole site.
    expect(ctaPathGroup("/")).toBe("/");
    expect(ctaPathGroup("/en/")).toBe("/");
    expect(ctaPathGroup("/about")).not.toBe("/");
  });

  it("returns null for a path no placement can target", () => {
    expect(ctaPathGroup("/nothing-here")).toBeNull();
    expect(ctaPathGroup("/projectsy")).toBeNull();
  });

  it("offers every static page as a target", () => {
    expect(CTA_PATHS).toContain("/");
    expect(CTA_PATHS).toContain("/projects");
    expect(CTA_PATHS).toContain("/contact");
  });
});

describe("buildCtaMounts", () => {
  const block = (id: string, isDefault = false): CtaBlock => ({
    id,
    name: id,
    isDefault,
    backgroundImageUrl: null,
    primaryKind: CtaLinkKind.PAGE,
    primaryHref: "/contact",
    secondaryKind: CtaLinkKind.WHATSAPP,
    secondaryHref: null,
    translations: [],
  });

  /**
   * Which blocks a visitor on this path would actually see, decided by the
   * same routeMatches() RouteGate runs in the browser.
   *
   * The list is what matters, not just its first entry: two mounts
   * matching one page means two CTAs stacked above the footer, and that is
   * the failure this whole arrangement has to rule out.
   */
  const shownOn = (mounts: CtaMount[], pathname: string) =>
    mounts
      .filter(
        (mount) =>
          (!mount.only || mount.only.some((path) => routeMatches(pathname, path))) &&
          !mount.except?.some((path) => routeMatches(pathname, path)),
      )
      .map((mount) => mount.block?.id ?? `file:${mount.variant}`);

  const general = block("general", true);
  const projects = block("projects");
  const mounts = buildCtaMounts(
    [general, projects],
    [
      { path: "/projects", blockId: "projects" },
      { path: "/contact", blockId: null },
    ],
  );

  it("gives every page exactly one CTA", () => {
    for (const path of CTA_PATHS) {
      expect(shownOn(mounts, path).length, path).toBeLessThanOrEqual(1);
    }
  });

  it("sends an assigned page to its own block", () => {
    expect(shownOn(mounts, "/projects")).toEqual(["projects"]);
    // And every development under it, without a row per project.
    expect(shownOn(mounts, "/projects/andaman-bay-villa")).toEqual(["projects"]);
  });

  it("sends everything else to the default", () => {
    expect(shownOn(mounts, "/")).toEqual(["general"]);
    expect(shownOn(mounts, "/news")).toEqual(["general"]);
    expect(shownOn(mounts, "/news/an-article")).toEqual(["general"]);
  });

  it("shows nothing where a placement says to show nothing", () => {
    // A row with no block is a decision, and the default must not
    // override it.
    expect(shownOn(mounts, "/contact")).toEqual([]);
  });

  it("still resolves once when the default is also placed explicitly", () => {
    const both = buildCtaMounts([general], [{ path: "/news", blockId: "general" }]);

    expect(shownOn(both, "/news")).toEqual(["general"]);
    expect(shownOn(both, "/about")).toEqual(["general"]);
  });

  it("leaves unassigned pages bare when no block is the default", () => {
    // Legal, and the admin screen warns about it — but it must not fall
    // back to some other block by accident.
    const orphaned = buildCtaMounts(
      [block("projects")],
      [{ path: "/projects", blockId: "projects" }],
    );

    expect(shownOn(orphaned, "/projects")).toEqual(["projects"]);
    expect(shownOn(orphaned, "/about")).toEqual([]);
  });

  it("falls back to the message-file copy when there are no blocks at all", () => {
    // A fresh database, an unrun migration or an unreachable Postgres —
    // the band must not go blank on every page of the site.
    const empty = buildCtaMounts([], []);

    expect(shownOn(empty, "/")).toEqual(["file:default"]);
    expect(shownOn(empty, "/projects/villa")).toEqual(["file:projects"]);
    expect(shownOn(empty, "/about")).toEqual(["file:about"]);
    expect(shownOn(empty, "/contact")).toEqual([]);

    for (const path of CTA_PATHS) {
      expect(shownOn(empty, path).length, path).toBeLessThanOrEqual(1);
    }
  });
});

describe("ctaButtonHref", () => {
  it("prefixes an internal page with the visitor's locale", () => {
    expect(ctaButtonHref(CtaLinkKind.PAGE, "/contact", links)).toEqual({
      href: "/th/contact",
      newTab: false,
    });
  });

  it("does not produce a double slash for the home page", () => {
    expect(ctaButtonHref(CtaLinkKind.PAGE, "/", links)?.href).toBe("/th");
  });

  it("builds WhatsApp from settings rather than a stored copy", () => {
    const button = ctaButtonHref(CtaLinkKind.WHATSAPP, null, links);

    // Digits only: wa.me rejects the spaces and + the settings field keeps
    // for the humans reading it.
    expect(button).toEqual({
      href: "https://wa.me/66989369542?text=Hello",
      newTab: true,
    });
  });

  it("builds the phone link from settings, and does not open a tab for it", () => {
    // A tel: link hands over to the phone app; target=_blank would leave
    // an empty tab behind on the desktop.
    expect(ctaButtonHref(CtaLinkKind.PHONE, null, links)).toEqual({
      href: "tel:+66989369542",
      newTab: false,
    });
  });

  it("opens an external URL in a new tab", () => {
    expect(ctaButtonHref(CtaLinkKind.URL, "https://example.com", links)).toEqual({
      href: "https://example.com",
      newTab: true,
    });
  });

  it("renders no button for NONE, or for a kind with nothing filled in", () => {
    expect(ctaButtonHref(CtaLinkKind.NONE, "/contact", links)).toBeNull();
    expect(ctaButtonHref(CtaLinkKind.PAGE, null, links)).toBeNull();
    expect(ctaButtonHref(CtaLinkKind.URL, "", links)).toBeNull();
  });

  it("renders no WhatsApp button when the number has not been set", () => {
    const blank = { ...links, settings: { contact: { whatsapp: "", phone: "" } } as SiteSettings };

    expect(ctaButtonHref(CtaLinkKind.WHATSAPP, null, blank)).toBeNull();
    expect(ctaButtonHref(CtaLinkKind.PHONE, null, blank)).toBeNull();
  });

  it("covers every kind the database can hold", () => {
    // A new enum value with no branch here would fall through to PAGE and
    // silently render the wrong link.
    expect([...CTA_LINK_KINDS].sort()).toEqual(Object.keys(CtaLinkKind).sort());
  });
});

describe("formatCtaMessage", () => {
  it("counts developments instead of naming a number", () => {
    const message = "{count, plural, =3 {Walk all three} other {Walk all #}} in one morning";

    expect(formatCtaMessage(message, "en", 3)).toBe("Walk all three in one morning");
    expect(formatCtaMessage(message, "en", 5)).toBe("Walk all 5 in one morning");
  });

  it("leaves a sentence with no placeholder alone", () => {
    expect(formatCtaMessage("Come and see the site", "en", 3)).toBe("Come and see the site");
  });

  it("falls back to the raw text rather than throwing", () => {
    // Reaching this means a row was written around the validation. A
    // visible oddity on the page beats a 500 on every page.
    const broken = "{count, plural, =3 {unclosed";
    expect(formatCtaMessage(broken, "en", 3)).toBe(broken);
  });
});

describe("ctaMessageError", () => {
  it("accepts plain text and a well-formed plural", () => {
    expect(ctaMessageError("Come and meet the team")).toBeNull();
    expect(ctaMessageError("{count, plural, one {# villa} other {# villas}}")).toBeNull();
  });

  it("rejects unbalanced braces", () => {
    expect(ctaMessageError("{count, plural, =3 {all three}")).not.toBeNull();
  });

  it("rejects a placeholder nothing can supply", () => {
    // Only `count` is passed at render time, so {name} would render as an
    // error marker on the live page.
    expect(ctaMessageError("Hello {name}")).not.toBeNull();
  });

  it("rejects a plural with no other branch", () => {
    // Fine for count 3, broken for every other number — the failure a
    // one-count check would miss.
    expect(ctaMessageError("{count, plural, =3 {all three}}")).not.toBeNull();
  });
});

describe("siteCtaBlockSchema", () => {
  const valid = {
    locale: "en",
    name: "General",
    isActive: true,
    isDefault: false,
    sortOrder: "0",
    backgroundImageUrl: "",
    primaryKind: "PAGE",
    primaryHref: "/contact",
    secondaryKind: "WHATSAPP",
    secondaryHref: "",
    eyebrow: "Speak to us",
    title: "Come and see the site",
    subtitle: "Tell us when suits you.",
    primaryLabel: "Arrange a viewing",
    secondaryLabel: "Chat on WhatsApp",
  };

  const errorPaths = (input: Record<string, unknown>) => {
    const result = siteCtaBlockSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
  };

  it("accepts a filled-in block", () => {
    expect(siteCtaBlockSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a destination for the kinds that have one", () => {
    expect(errorPaths({ ...valid, primaryHref: "" })).toContain("primaryHref");
    expect(errorPaths({ ...valid, secondaryKind: "URL", secondaryHref: "" })).toContain(
      "secondaryHref",
    );
  });

  it("does not ask for one when the target comes from settings", () => {
    expect(errorPaths({ ...valid, primaryKind: "PHONE", primaryHref: "" })).toEqual([]);
  });

  it("refuses a locale prefix on an internal page", () => {
    // /en/contact would send a Thai visitor to the English page.
    expect(errorPaths({ ...valid, primaryHref: "en/contact" })).toContain("primaryHref");
  });

  it("refuses a bare domain for an external link", () => {
    expect(errorPaths({ ...valid, primaryKind: "URL", primaryHref: "example.com" })).toContain(
      "primaryHref",
    );
  });

  it("refuses a button with a destination but no words", () => {
    expect(errorPaths({ ...valid, primaryLabel: "" })).toContain("primaryLabel");
  });

  it("asks for no label on a button that is not rendered", () => {
    expect(errorPaths({ ...valid, secondaryKind: "NONE", secondaryLabel: "" })).toEqual([]);
  });

  it("refuses a headline that would not render", () => {
    expect(errorPaths({ ...valid, title: "{count, plural, =3 {broken" })).toContain("title");
    expect(errorPaths({ ...valid, subtitle: "Ask for {name}" })).toContain("subtitle");
  });

  it("requires a headline", () => {
    expect(errorPaths({ ...valid, title: "   " })).toContain("title");
  });
});
