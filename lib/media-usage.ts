/**
 * lib/media-usage.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Where is this file used" for the media library — the badge on every
 * thumbnail, the panel listing the pages a file appears on, and the check
 * that stops a still-referenced file from being deleted.
 *
 * There is no foreign key from a project's hero photo to a Media row: every
 * image field across the schema (Project.heroImageUrl,
 * NewsArticle.coverImageUrl, …) is a plain URL string, the same convention
 * ImageUploader has always written. Wiring every one of those to a real
 * relation would be a much larger migration than the media library itself
 * justifies today, so usage is found by matching the stored URL against
 * every column known to hold one — see SOURCES below. Keep that list in
 * sync with schema.prisma: a new *Url column that isn't added here is
 * invisible to both the usage panel and the delete guard, and a photo used
 * from it could disappear out from under a live page.
 *
 * EVERY LOOKUP IS BATCHED, BECAUSE THE GRID ASKS ABOUT ALL OF THEM.
 *
 * Each source takes a list of URLs and answers in one query. That is what
 * makes "used in 3 places" affordable as a badge on every tile: the whole
 * library costs one query per source (twenty-odd), not one per source per
 * file (which for a 500-file library would have been eleven thousand). The
 * per-file entry points below are thin wrappers over the same batch.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";

export type MediaUsageRef = {
  /** i18n key suffix under admin.media.usageKind.* */
  kind: string;
  label: string;
  /** The editing screen, from "/admin" on and without the locale, which the
   *  caller puts in front. Not "/news/…" with "/admin" added by the caller:
   *  the media panel once added it to these and linked to /admin/admin/…. */
  href: string | null;
  /** i18n key suffix under admin.media.usageNote.*, e.g. which field. */
  note: string;
};

/** A reference found, tagged with the URL that produced it. */
type UsageHit = { url: string; label: string; href: string | null };

type Source = {
  kind: string;
  note: string;
  findMany: (urls: string[]) => Promise<UsageHit[]>;
};

/*
  Prisma's argument and row types differ per model, and this table
  deliberately treats twenty-two of them uniformly — the row shape is
  whatever that entry's own `select` asked for. `label` and `href` are the
  only things that read a row, and each is written directly beside the
  select it belongs to.
*/
type Row = Record<string, any>;

/**
 * One model, one URL column — the shape every source below has.
 *
 * The URL column is added to the select whether or not the caller asked
 * for it: with many URLs in flight, a returned row has to say which one it
 * matched, and that is the only way to know.
 */
function column(config: {
  kind: string;
  note: string;
  field: string;
  find: (args: any) => Promise<Row[]>;
  select: Record<string, unknown>;
  where?: Record<string, unknown>;
  label: (row: Row) => string;
  href: (row: Row) => string | null;
}): Source {
  return {
    kind: config.kind,
    note: config.note,
    findMany: async (urls) => {
      if (urls.length === 0) return [];

      const rows = await config.find({
        where: { ...config.where, [config.field]: { in: urls } },
        select: { ...config.select, [config.field]: true },
      });

      return rows.map((row) => ({
        url: String(row[config.field]),
        label: config.label(row),
        href: config.href(row),
      }));
    },
  };
}

/**
 * One model, one String[] column (Project.gallery, ProjectProgress.images):
 * a row matches when any of its entries is one of the URLs, and reports
 * each entry that is.
 */
function arrayColumn(config: {
  kind: string;
  note: string;
  field: string;
  find: (args: any) => Promise<Row[]>;
  select: Record<string, unknown>;
  label: (row: Row) => string;
  href: (row: Row) => string | null;
}): Source {
  return {
    kind: config.kind,
    note: config.note,
    findMany: async (urls) => {
      if (urls.length === 0) return [];
      const wanted = new Set(urls);
      const rows = await config.find({
        where: { [config.field]: { hasSome: urls } },
        select: { ...config.select, [config.field]: true },
      });
      return rows.flatMap((row) =>
        (row[config.field] as string[])
          .filter((url) => wanted.has(url))
          .map((url) => ({ url, label: config.label(row), href: config.href(row) })),
      );
    },
  };
}

/** Where the admin edits each image-bearing setting. */
function settingHref(key: string): string {
  if (key.startsWith("projectsHero.")) return "/admin/pages/projects";
  return "/admin/seo/defaults";
}

const projectSelect = { id: true, nameEn: true, nameTh: true };
const projectLabel = (p: Row) => p.nameEn || p.nameTh;
const projectHref = (p: Row) => `/admin/projects/${p.id}/edit`;

const SOURCES: Source[] = [
  column({
    kind: "projectHero",
    note: "heroImage",
    field: "heroImageUrl",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: projectHref,
  }),
  column({
    kind: "project",
    note: "conceptDesignImage",
    field: "conceptDesignImageUrl",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: projectHref,
  }),
  column({
    kind: "project",
    note: "aboutThisProjectImage",
    field: "aboutThisProjectImageUrl",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: projectHref,
  }),
  column({
    kind: "project",
    note: "masterPlanImage",
    field: "masterPlanImageUrl",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: projectHref,
  }),
  column({
    kind: "project",
    note: "brochureFile",
    field: "brochureUrl",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: projectHref,
  }),
  column({
    kind: "project",
    note: "heroVideo",
    field: "heroVideoUrl",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: projectHref,
  }),
  column({
    kind: "unitType",
    note: "coverImage",
    field: "coverImageUrl",
    find: (args) => prisma.projectUnitType.findMany(args),
    select: { id: true, name: true, projectId: true },
    label: (u) => u.name,
    href: (u) => `/admin/projects/${u.projectId}/edit`,
  }),
  column({
    kind: "floorPlan",
    note: "image",
    field: "imageUrl",
    find: (args) => prisma.floorPlan.findMany(args),
    select: { id: true, unitType: { select: { projectId: true, name: true } } },
    label: (f) => f.unitType.name,
    // The floors are edited on the unit-types screen, not the project's own
    // edit form — this used to send people to a page with no floor on it.
    href: (f) => `/admin/projects/${f.unitType.projectId}/unit-types`,
  }),
  column({
    kind: "floorPlan",
    note: "furnished",
    field: "furnishedImageUrl",
    find: (args) => prisma.floorPlan.findMany(args),
    select: { id: true, unitType: { select: { projectId: true, name: true } } },
    label: (f) => f.unitType.name,
    href: (f) => `/admin/projects/${f.unitType.projectId}/unit-types`,
  }),
  /*
    blueprintImageUrl is deliberately absent. It is derived by
    lib/floor-plan-images.ts from imageUrl and regenerated at a predictable
    key, so it is not a library image somebody chose — listing it would
    report the same drawing as "used twice" and offer a delete for a file
    the next save recreates.
  */
  column({
    kind: "floorPlanRoom",
    note: "roomPhoto",
    field: "photoUrl",
    find: (args) => prisma.floorPlanRoom.findMany(args),
    select: {
      id: true,
      translations: { select: { locale: true, name: true } },
      floorPlan: {
        select: { floorName: true, unitType: { select: { projectId: true, name: true } } },
      },
    },
    label: (room) => {
      const name =
        room.translations.find((t: { locale: string }) => t.locale === "en")?.name ??
        room.translations[0]?.name ??
        "";
      return [name, room.floorPlan.unitType.name].filter(Boolean).join(" · ");
    },
    href: (room) => `/admin/projects/${room.floorPlan.unitType.projectId}/unit-types`,
  }),
  column({
    kind: "facility",
    note: "image",
    field: "imageUrl",
    find: (args) => prisma.projectFacility.findMany(args),
    select: { id: true, nameEn: true, nameTh: true, projectId: true },
    label: (f) => f.nameEn || f.nameTh,
    href: (f) => `/admin/projects/${f.projectId}/edit`,
  }),
  column({
    kind: "companyProfile",
    note: "storyImage",
    field: "storyImageUrl",
    find: (args) => prisma.companyProfile.findMany(args),
    select: { id: true },
    label: () => "Company profile",
    href: () => "/admin/pages/about/corporate",
  }),
  column({
    kind: "progressUpdate",
    note: "video",
    field: "videoUrl",
    find: (args) => prisma.projectProgress.findMany(args),
    select: { id: true, month: true, year: true, projectId: true },
    label: (p) => `${p.month}/${p.year}`,
    href: (p) => `/admin/projects/${p.projectId}/progress`,
  }),
  column({
    kind: "heroSlide",
    note: "media",
    field: "mediaUrl",
    find: (args) => prisma.heroStorySlide.findMany(args),
    select: { id: true },
    label: () => "Hero banner slide",
    href: () => "/admin/pages/home/hero",
  }),
  column({
    kind: "heroSlide",
    note: "poster",
    field: "posterImageUrl",
    find: (args) => prisma.heroStorySlide.findMany(args),
    select: { id: true },
    label: () => "Hero banner slide",
    href: () => "/admin/pages/home/hero",
  }),
  column({
    kind: "salesPerson",
    note: "photo",
    field: "photoUrl",
    find: (args) => prisma.salesPerson.findMany(args),
    select: { id: true, nameEn: true, nameTh: true },
    label: (s) => s.nameEn || s.nameTh,
    href: () => "/admin/sales-team",
  }),
  column({
    kind: "award",
    note: "trophy",
    field: "trophyImageUrl",
    find: (args) => prisma.award.findMany(args),
    select: { id: true, titleEn: true },
    label: (a) => a.titleEn,
    href: () => "/admin/pages/about/awards",
  }),
  column({
    kind: "milestone",
    note: "image",
    field: "imageUrl",
    find: (args) => prisma.milestone.findMany(args),
    select: { id: true, year: true },
    label: (m) => String(m.year),
    href: () => "/admin/pages/about/milestones",
  }),
  column({
    kind: "homeGallery",
    note: "image",
    field: "imageUrl",
    find: (args) => prisma.homeGalleryPhoto.findMany(args),
    select: { id: true },
    label: () => "Home gallery",
    href: () => "/admin/pages/home/gallery",
  }),
  column({
    kind: "corporateService",
    note: "image",
    field: "imageUrl",
    find: (args) => prisma.corporateService.findMany(args),
    select: { id: true },
    label: () => "Corporate service",
    href: () => "/admin/pages/about/corporate",
  }),
  column({
    kind: "eBrochure",
    note: "file",
    field: "fileUrl",
    find: (args) => prisma.eBrochure.findMany(args),
    select: { id: true, translations: { take: 1, select: { title: true } } },
    label: (b) => b.translations[0]?.title ?? b.id,
    href: () => "/admin/e-brochures",
  }),
  column({
    kind: "eBrochure",
    note: "cover",
    field: "coverImageUrl",
    find: (args) => prisma.eBrochure.findMany(args),
    select: { id: true, translations: { take: 1, select: { title: true } } },
    label: (b) => b.translations[0]?.title ?? b.id,
    href: () => "/admin/e-brochures",
  }),
  column({
    kind: "news",
    note: "cover",
    field: "coverImageUrl",
    find: (args) => prisma.newsArticle.findMany(args),
    select: { id: true, titleEn: true, titleTh: true },
    where: { deletedAt: null },
    label: (n) => n.titleEn || n.titleTh,
    href: (n) => `/admin/news/${n.id}/edit`,
  }),
  column({
    kind: "event",
    note: "cover",
    field: "coverImageUrl",
    find: (args) => prisma.event.findMany(args),
    select: { id: true, titleEn: true, titleTh: true },
    label: (e) => e.titleEn || e.titleTh,
    href: (e) => `/admin/events/${e.id}/edit`,
  }),

  /*
    Everything below was missing until 2026-10-22, so the library reported
    these files as unused and let them be deleted from Spaces for good while
    a live page still showed them: the project gallery, every progress
    photo, share images, the About hero, CTA backgrounds, the logo, and
    images inside article bodies. tests/media-usage-coverage.test.ts now
    fails when a URL field is added to the schema and not listed here.
  */
  arrayColumn({
    kind: "project",
    note: "gallery",
    field: "gallery",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: projectHref,
  }),
  arrayColumn({
    kind: "unitType",
    note: "gallery",
    field: "gallery",
    find: (args) => prisma.projectUnitType.findMany(args),
    select: { id: true, name: true, projectId: true },
    label: (u) => u.name,
    href: (u) => `/admin/projects/${u.projectId}/unit-types`,
  }),
  arrayColumn({
    kind: "progressUpdate",
    note: "image",
    field: "images",
    find: (args) => prisma.projectProgress.findMany(args),
    select: { id: true, month: true, year: true, projectId: true },
    label: (p) => `${p.month}/${p.year}`,
    href: (p) => `/admin/projects/${p.projectId}/progress`,
  }),
  column({
    kind: "project",
    note: "ogImage",
    field: "ogImageUrl",
    find: (args) => prisma.project.findMany(args),
    select: projectSelect,
    label: projectLabel,
    href: (p) => `/admin/projects/${p.id}/seo`,
  }),
  column({
    kind: "news",
    note: "ogImage",
    field: "ogImageUrl",
    find: (args) => prisma.newsArticle.findMany(args),
    select: { id: true, titleEn: true, titleTh: true },
    label: (n) => n.titleEn || n.titleTh,
    href: (n) => `/admin/news/${n.id}/edit`,
  }),
  column({
    kind: "event",
    note: "ogImage",
    field: "ogImageUrl",
    find: (args) => prisma.event.findMany(args),
    select: { id: true, titleEn: true, titleTh: true },
    label: (e) => e.titleEn || e.titleTh,
    href: (e) => `/admin/events/${e.id}/edit`,
  }),
  column({
    kind: "companyProfile",
    note: "aboutHero",
    field: "aboutHeroImageUrl",
    find: (args) => prisma.companyProfile.findMany(args),
    select: { id: true },
    label: () => "About page hero",
    href: () => "/admin/pages/about/story",
  }),
  column({
    kind: "siteCta",
    note: "background",
    field: "backgroundImageUrl",
    find: (args) => prisma.siteCtaBlock.findMany(args),
    select: { id: true, name: true },
    label: (b) => b.name,
    href: () => "/admin/pages/home/cta",
  }),
  column({
    kind: "siteSetting",
    note: "setting",
    field: "value",
    find: (args) => prisma.siteSetting.findMany(args),
    select: { key: true },
    label: (row) => row.key,
    href: (row) => settingHref(row.key),
  }),
  {
    // An image placed inside an article's body. The URL is in the HTML, so
    // this is a substring match, one OR term per URL in the batch.
    kind: "news",
    note: "bodyImage",
    findMany: async (urls) => {
      if (urls.length === 0) return [];
      const rows = await prisma.newsArticleTranslation.findMany({
        where: { OR: urls.map((url) => ({ content: { contains: url } })) },
        select: { content: true, locale: true, article: { select: { id: true, titleEn: true, titleTh: true } } },
      });
      return rows.flatMap((row: Row) =>
        urls
          .filter((url) => String(row.content ?? "").includes(url))
          .map((url) => ({
            url,
            label: `${row.article.titleEn || row.article.titleTh} (${row.locale})`,
            href: `/admin/news/${row.article.id}/edit`,
          })),
      );
    },
  },
];

/**
 * Every reference to every URL given, grouped by URL.
 *
 * One query per source for the whole batch. A URL with no references is
 * absent from the map rather than present with an empty array — callers
 * that want a count should read through `?? 0`.
 */
export async function findMediaUsageForUrls(
  urls: string[],
): Promise<Map<string, MediaUsageRef[]>> {
  const byUrl = new Map<string, MediaUsageRef[]>();
  if (urls.length === 0) return byUrl;

  // De-duplicated: two Media rows can legitimately carry the same URL, and
  // asking the database about it twice would only cost time.
  const unique = [...new Set(urls)];

  const perSource = await Promise.all(
    SOURCES.map(async (source) => {
      const hits = await source.findMany(unique);
      return hits.map((hit) => ({
        url: hit.url,
        ref: { kind: source.kind, note: source.note, label: hit.label, href: hit.href },
      }));
    }),
  );

  for (const { url, ref } of perSource.flat()) {
    const list = byUrl.get(url);
    if (list) list.push(ref);
    else byUrl.set(url, [ref]);
  }

  return byUrl;
}

/** How many places each URL is used. Same batch, tallied. */
export async function countMediaUsage(urls: string[]): Promise<Map<string, number>> {
  const byUrl = await findMediaUsageForUrls(urls);
  return new Map([...byUrl].map(([url, refs]) => [url, refs.length]));
}

/** Every reference to one file — the detail panel's "used in" list. */
export async function findMediaUsage(url: string): Promise<MediaUsageRef[]> {
  return (await findMediaUsageForUrls([url])).get(url) ?? [];
}

/** Cheap existence check for the delete guard — stop scanning at the first hit. */
export async function isMediaUrlInUse(url: string): Promise<boolean> {
  for (const source of SOURCES) {
    const hits = await source.findMany([url]);
    if (hits.length > 0) return true;
  }
  return false;
}
