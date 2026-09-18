/**
 * lib/seo.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turning a stored brand-asset setting into something a tag can carry.
 *
 * Every branding value in lib/settings.ts is one of two shapes: a
 * /public-relative path (the committed default in config/site.ts) or an
 * absolute CDN URL (an admin upload). Almost everywhere that is already
 * handled for free — app/[locale]/layout.tsx sets `metadataBase`, and Next
 * resolves relative openGraph/twitter images against it, on child routes
 * too. The exception is the JSON-LD in news/[slug], which builds its
 * publisher logo by string concatenation; `${siteConfig.url}${value}`
 * produces "https://example.comhttps://cdn…" the moment the value is
 * absolute, and structured data has no metadataBase to save it.
 *
 * Kept out of lib/settings.ts on purpose: that module is `server-only` and
 * constructs a PrismaClient at module scope, so a unit test for string
 * joining would have to mock Prisma to get at it. Nothing here touches the
 * database — it takes resolved values as arguments.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { locales, defaultLocale } from "@/i18n";

/**
 * http(s) only, and deliberately not true for "//host/x.png".
 *
 * A protocol-relative URL is absolute to a browser and relative to naive
 * string joining, and that disagreement is exactly how an og:image ends up
 * pointing at somebody else's server. absoluteAssetUrl() refuses those
 * rather than guessing; lib/validations.ts refuses them on the way in too,
 * so this is the second of two doors.
 */
export function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * The `alternates` block every page's generateMetadata builds by hand:
 * a canonical URL plus one `languages` entry per locale, cross-linking the
 * Thai/English/Chinese/Russian versions of the same path so Google pairs
 * them instead of treating them as duplicates competing for the same
 * query.
 *
 * Also stamps `x-default` — the entry a crawler (or a browser with no
 * locale match) falls back to. Left out entirely before this helper
 * existed, which meant a non-locale-matching visitor and an ambiguous
 * crawler request had no declared fallback; the Thai build is the
 * canonical entry point, so that is what x-default points at.
 *
 * `path` is the part after the locale segment — `""` for the homepage,
 * `"/about"`, `"/projects/${slug}"`, etc. (no trailing slash).
 */
export function localizedAlternates(
  locale: string,
  path: string,
): { canonical: string; languages: Record<string, string> } {
  const languages = Object.fromEntries(
    locales.map((l) => [l, `${siteConfig.url}/${l}${path}`]),
  );
  languages["x-default"] = `${siteConfig.url}/${defaultLocale}${path}`;

  return {
    canonical: `${siteConfig.url}/${locale}${path}`,
    languages,
  };
}

/**
 * A stored image setting → an absolute URL, or "" when there isn't one.
 *
 *   "/og-image.jpg"          → "https://site.example/og-image.jpg"
 *   "https://cdn/x.jpg"      → unchanged
 *   "og-image.jpg"           → "https://site.example/og-image.jpg"
 *   "//evil.example/x.png"   → ""
 *   "" | "   " | null        → ""
 *
 * Returning "" rather than throwing: a missing publisher logo drops one
 * optional field out of a JSON-LD block (JsonLd.tsx prunes empty strings),
 * whereas a throw here would take down a page that renders fine without it.
 */
export function absoluteAssetUrl(
  value: string | null | undefined,
  base: string = siteConfig.url,
): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length === 0) return "";
  if (trimmed.startsWith("//")) return "";
  if (isAbsoluteHttpUrl(trimmed)) return trimmed;

  const origin = base.replace(/\/+$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return `${origin}${path}`;
}

/**
 * One entry in a page's BreadcrumbList JSON-LD (schema.org): the trail a
 * page sits in, e.g. Home > Projects > The Residence, in order. `url` is
 * absolute — pass the same fully-qualified URLs used for `canonical`
 * above, not locale-relative paths.
 */
export type BreadcrumbItem = { name: string; url: string };

/**
 * A BreadcrumbList payload for JsonLd. Not wired through metadata like
 * localizedAlternates — this is rendered as a second <JsonLd> block
 * alongside a page's existing structured data (Article/Event/
 * RealEstateListing/etc.), since BreadcrumbList is additive, not a
 * replacement for the page's own @type.
 */
/**
 * One trail, built once, rendered twice.
 *
 * A page has two breadcrumbs — the one a visitor reads and the JSON-LD one
 * Google reads — and before this they were written out separately, which is
 * two lists to keep saying the same thing. `href` feeds
 * components/Breadcrumb.tsx and `url` feeds breadcrumbList() below, from
 * the same array.
 *
 * `path` is locale-relative and empty for the home page: "" gives "/th",
 * "/projects" gives "/th/projects".
 */
export function trailFor(
  locale: string,
  segments: { name: string; path: string }[],
): { name: string; href: string; url: string }[] {
  return segments.map((segment) => ({
    name: segment.name,
    href: `/${locale}${segment.path}`,
    url: `${siteConfig.url}/${locale}${segment.path}`,
  }));
}

export function breadcrumbList(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** True when the stored value is still the one committed in config/site.ts. */
function isCommittedDefault(value: string, committed: string): boolean {
  return value.trim().length === 0 || value.trim() === committed;
}

/**
 * The one branch of Metadata["icons"] this module ever returns.
 *
 * Declared structurally rather than as `NonNullable<Metadata["icons"]>`,
 * which is a union that includes a bare string and an array — so callers
 * (and tests) could not reach `.icon` on it without narrowing first. The
 * layout assigns the result straight into a Metadata object, so
 * assignability is still checked at the point that matters.
 */
export type IconsMetadata = {
  icon: { url: string; type?: string; sizes?: string }[];
  apple: { url: string; sizes?: string }[];
  shortcut: string[];
};

/**
 * `metadata.icons` for a resolved favicon setting.
 *
 * With no custom icon this returns exactly what the layout hardcoded
 * before: the .ico for browsers that still ask for one, plus the two PNG
 * sizes.
 *
 * With a custom icon it returns exactly ONE entry, and the committed
 * /favicon.ico is deliberately absent. Browsers arbitrate between competing
 * <link rel="icon"> tags by per-engine heuristics — size, order, type — so
 * leaving the old .ico in the list means a decent share of operators upload
 * a new mark, see the old one, and report the feature as broken. One entry
 * is the only deterministic answer.
 *
 * No `sizes` on the custom entry either: we cannot measure an uploaded PNG
 * server-side, and a declared size that is wrong is worse than none.
 */
export function buildIconsMetadata(faviconUrl: string): IconsMetadata {
  const { branding } = siteConfig;

  if (isCommittedDefault(faviconUrl, branding.favicon)) {
    return {
      icon: [
        { url: branding.favicon, sizes: "any" },
        { url: branding.icon192, type: "image/png", sizes: "192x192" },
        { url: branding.icon512, type: "image/png", sizes: "512x512" },
      ],
      apple: [{ url: branding.appleTouchIcon, sizes: "180x180" }],
      shortcut: [branding.favicon],
    };
  }

  const custom = faviconUrl.trim();

  return {
    icon: [{ url: custom, type: "image/png" }],
    apple: [{ url: custom }],
    shortcut: [custom],
  };
}

/**
 * Manifest icons for the same setting.
 *
 * The uploaded PNG fills the `any` slots only. `purpose: "maskable"` keeps
 * pointing at the committed asset because maskable artwork has to sit
 * inside Android's 80% safe zone — public/icon-maskable-512.png exists
 * precisely because the brand mark had to be rescaled for it — and an
 * operator uploading a square logo will not have done that. Promoting their
 * file to maskable would crop it on every Android launcher.
 */
export function buildManifestIcons(
  faviconUrl: string,
): MetadataRoute.Manifest["icons"] {
  const { branding } = siteConfig;

  if (isCommittedDefault(faviconUrl, branding.favicon)) {
    return [
      { src: branding.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: branding.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: branding.iconMaskable,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ];
  }

  return [
    {
      src: faviconUrl.trim(),
      // Both sizes claimed off one file: the manifest allows a
      // space-separated list, and an operator icon is one square PNG that
      // the launcher scales. Honest about what we have.
      sizes: "192x192 512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: branding.iconMaskable,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];
}
