import "server-only";

/**
 * lib/site-cta.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The closing CTA band — which block each public page shows, what its
 * buttons point at, and how its ICU copy is formatted.
 *
 * Read by components/SiteCta.tsx (one block) and by
 * app/[locale]/(site)/layout.tsx (the whole mount list), written by
 * app/[locale]/admin/pages/home/cta/actions.ts.
 *
 * WHY THE LAYOUT MOUNTS EVERY BLOCK INSTEAD OF PICKING ONE
 *
 * The CTA sits below {children} in the site layout, and a Next layout is
 * not told which page it is wrapping. Resolving the block on the server
 * would mean reading the request path out of headers(), which makes every
 * route dynamic and breaks the `revalidate` set on the statically rendered
 * pages — the same trap setRequestLocale exists to avoid.
 *
 * So the server builds a *mount list* — every block, each paired with the
 * paths it owns — and components/RouteGate.tsx (a client component, and
 * therefore able to call usePathname) drops all but the matching one. That
 * check runs during server rendering too, so the HTML a crawler receives
 * contains exactly one CTA, not all of them.
 *
 * EMPTY MEANS "USE THE FILE COPY"
 *
 * With no rows in site_cta_blocks — a fresh database, an unrun migration,
 * Postgres unreachable — getCtaMounts returns FILE_COPY_MOUNTS, which
 * reproduces the hand-written arrangement this feature replaced: the
 * general copy everywhere, the projects and about wording on their own
 * pages, nothing on /contact. The band cannot go blank because the table
 * is empty, and clearing the table is a supported way back.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { cache } from "react";
import { createTranslator } from "next-intl";
import { CtaLinkKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getTranslation } from "@/lib/get-translation";
import { STATIC_PATHS, stripLocale } from "@/lib/public-paths";
import type { SiteSettings } from "@/lib/settings";
import type { Locale } from "@/i18n";

export { CtaLinkKind };

/** The page groups a placement may target — the static routes, with every
 *  detail page folded into its section ("/projects/x" → "/projects"). */
export const CTA_PATHS = STATIC_PATHS;

export type CtaPath = (typeof CTA_PATHS)[number];

/**
 * The page group a public path belongs to.
 *
 * Longest static path that the given path sits under, so "/projects/villa"
 * answers "/projects" and an unknown route answers "/" only if it really
 * is the home page — otherwise null, meaning no placement can target it
 * and the default block applies.
 */
export function ctaPathGroup(pathOrUrl: string): CtaPath | null {
  const path = stripLocale(pathOrUrl);
  if (path === "/") return "/";

  let best: CtaPath | null = null;

  for (const candidate of CTA_PATHS) {
    if (candidate === "/") continue;
    if (path !== candidate && !path.startsWith(`${candidate}/`)) continue;
    if (!best || candidate.length > best.length) best = candidate;
  }

  return best;
}

// ── Blocks ───────────────────────────────────────────────────────────────

export type CtaBlockTranslation = {
  locale: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  primaryLabel: string | null;
  secondaryLabel: string | null;
};

export type CtaBlock = {
  id: string;
  name: string;
  isDefault: boolean;
  backgroundImageUrl: string | null;
  primaryKind: CtaLinkKind;
  primaryHref: string | null;
  secondaryKind: CtaLinkKind;
  secondaryHref: string | null;
  translations: CtaBlockTranslation[];
};

/**
 * One rendering of the band: a block plus the routes it covers, in the
 * shape RouteGate takes. `block: null` is the messages/*.json fallback,
 * which is why `variant` rides along — see components/SiteCta.tsx.
 */
export type CtaMount = {
  key: string;
  only?: string[];
  except?: string[];
  block: CtaBlock | null;
  variant: "default" | "projects" | "about";
};

/** What the site did before any of this was editable. */
export const FILE_COPY_MOUNTS: CtaMount[] = [
  { key: "file:projects", only: ["/projects"], block: null, variant: "projects" },
  { key: "file:about", only: ["/about"], block: null, variant: "about" },
  {
    key: "file:default",
    except: ["/contact", "/projects", "/about"],
    block: null,
    variant: "default",
  },
];

/**
 * Active blocks and every placement row, in one round trip per request.
 *
 * cache()d because the layout asks for it on every page render and the
 * admin preview asks again for the same data; both want the same answer
 * within one request.
 */
export const getCtaData = cache(async () => {
  return safeQuery(
    "site-cta",
    async () => {
      const [blocks, placements] = await Promise.all([
        prisma.siteCtaBlock.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { translations: true },
        }),
        prisma.siteCtaPlacement.findMany({ orderBy: { path: "asc" } }),
      ]);

      return { blocks, placements };
    },
    { blocks: [], placements: [] } as {
      blocks: (CtaBlock & Record<string, unknown>)[];
      placements: { path: string; blockId: string | null }[];
    },
  );
});

/**
 * Every rendering of the band this site should mount.
 *
 * A block appears once per role it plays: once for the pages explicitly
 * assigned to it, and — if it is the default — once more for everything
 * else. A page assigned to the default block explicitly therefore matches
 * the first mount and is excluded from the second, so it still renders
 * exactly one band.
 *
 * Pure, and separate from the query, because this is the part that decides
 * whether a page shows one CTA, two, or none — see tests/site-cta.test.ts.
 */
export function buildCtaMounts(
  blocks: CtaBlock[],
  placements: { path: string; blockId: string | null }[],
): CtaMount[] {
  if (blocks.length === 0) return FILE_COPY_MOUNTS;

  const mounts: CtaMount[] = [];

  for (const block of blocks) {
    const only = placements
      .filter((placement) => placement.blockId === block.id)
      .map((placement) => placement.path);

    if (only.length > 0) {
      mounts.push({ key: `block:${block.id}`, only, block, variant: "default" });
    }
  }

  const fallback = blocks.find((block) => block.isDefault);

  if (fallback) {
    mounts.push({
      key: `default:${fallback.id}`,
      // Every path somebody has made a decision about, including the ones
      // decided to show nothing — a placement row with a null blockId is
      // an answer, and the default must not override it.
      except: placements.map((placement) => placement.path),
      block: fallback,
      variant: "default",
    });
  }

  return mounts;
}

/** buildCtaMounts against what is in the database right now. */
export async function getCtaMounts(): Promise<CtaMount[]> {
  const { blocks, placements } = await getCtaData();
  return buildCtaMounts(blocks, placements);
}

// ── Copy ─────────────────────────────────────────────────────────────────

/**
 * Format one editor-written string as an ICU message.
 *
 * `count` is the number of published developments, so a sentence can say
 * "all three" while there are three and "all 4" when a fourth opens. Any
 * other placeholder is a formatting error, which is what makes {count} a
 * contract rather than a guess.
 *
 * Anything that fails falls back to the raw text. A malformed message is
 * caught by lib/validations.ts before it can be saved, so reaching this
 * path means a row was written some other way — and showing the literal
 * "{count, plural..." is a visible bug an editor can fix, where a thrown
 * error would take down every page on the site at once.
 */
export function formatCtaMessage(
  message: string,
  locale: string,
  count: number,
): string {
  if (!message.includes("{")) return message;

  const t = createTranslator({
    locale,
    messages: { value: message },
    onError: () => {},
    getMessageFallback: () => message,
  });

  return t("value", { count });
}

/** The block's words for this locale, falling back the way every other
 *  public read does (requested → en → th). */
export function ctaCopy(block: CtaBlock, locale: string): CtaBlockTranslation | undefined {
  return getTranslation(block.translations, locale);
}

// ── Buttons ──────────────────────────────────────────────────────────────

export type CtaButton = {
  /** A path starting with "/" is an internal route; anything else is a
   *  wa.me link, a tel: link or an editor's absolute URL. */
  href: string;
  /** Opens in a new tab. True for links that leave the site in a browser
   *  sense — not for tel:, which hands over to the phone app and would
   *  leave an empty tab behind. */
  newTab: boolean;
};

/**
 * Where a button actually points.
 *
 * WHATSAPP and PHONE build their target from Settings → contact rather
 * than storing a copy, so changing the office number in one place changes
 * every CTA that offers it. Returns null when the button should not be
 * rendered at all — NONE, or a PAGE/URL kind with nothing filled in.
 */
export function ctaButtonHref(
  kind: CtaLinkKind,
  href: string | null,
  {
    locale,
    settings,
    whatsappGreeting,
  }: { locale: Locale | string; settings: SiteSettings; whatsappGreeting: string },
): CtaButton | null {
  switch (kind) {
    case CtaLinkKind.NONE:
      return null;

    case CtaLinkKind.WHATSAPP: {
      const number = settings.contact.whatsapp.replace(/\D/g, "");
      if (!number) return null;
      return {
        href: `https://wa.me/${number}?text=${encodeURIComponent(whatsappGreeting)}`,
        newTab: true,
      };
    }

    case CtaLinkKind.PHONE: {
      if (!settings.contact.phone) return null;
      return { href: `tel:${settings.contact.phone}`, newTab: false };
    }

    case CtaLinkKind.URL: {
      if (!href) return null;
      return { href, newTab: true };
    }

    case CtaLinkKind.PAGE:
    default: {
      if (!href) return null;
      // Stored locale-relative ("/contact") so one block serves four
      // languages; the visitor's own locale goes on at render time.
      const path = href.startsWith("/") ? href : `/${href}`;
      return { href: path === "/" ? `/${locale}` : `/${locale}${path}`, newTab: false };
    }
  }
}
