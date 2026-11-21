/**
 * lib/mcp/tools/catalog.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Projects, units, construction progress, e-brochures and events — read
 * only, for now. An AI client can see what the site says about each and
 * find what is missing (a language, a meta description, a cover image);
 * changing them is done in the back office.
 *
 * Every query names its columns. Nothing here returns "the row": a unit's
 * reservation (who reserved it, the lead behind it) and its internal notes
 * are customer and sales data and are never selected; an event's
 * registrations are counted, never listed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { defineTool } from "@/lib/mcp/registry";

const page = { limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).max(100_000).optional() };
const missing = (present: string[]) => locales.filter((code) => !present.includes(code));
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

defineTool({
  name: "projects_list",
  title: "List projects",
  description:
    "Every project (not in the trash): id, slug, name, property type, construction status, location, price range in THB, whether it is published, unit counts by sales status, and which languages are missing. Use project_get for the full text.",
  access: "read",
  capability: "viewContent",
  input: {},
  handler: async () => {
    const [rows, counts] = await Promise.all([
      prisma.project.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, slug: true, nameEn: true, nameTh: true, propertyType: true, status: true, location: true, priceFromTHB: true, priceToTHB: true,
          totalUnits: true, isPublished: true, contentStatus: true, updatedAt: true, translations: { select: { locale: true } },
        },
      }),
      prisma.projectUnit.groupBy({ by: ["projectId", "status"], _count: { _all: true } }),
    ]);
    return {
      projects: rows.map(({ translations, priceFromTHB, priceToTHB, ...row }) => ({
        ...row,
        priceFromTHB: num(priceFromTHB),
        priceToTHB: num(priceToTHB),
        units: Object.fromEntries(counts.filter((c) => c.projectId === row.id).map((c) => [c.status, c._count._all])),
        missingLanguages: missing(translations.map((t) => t.locale)),
      })),
    };
  },
});

defineTool({
  name: "project_get",
  title: "Read one project",
  description:
    "One project in full, by id or slug: facts (type, status, location, areas, prices, facilities, map and tour links, hero image, gallery) and every language version with its name, tagline, description, concept, meta title and meta description.",
  access: "read",
  capability: "viewContent",
  input: { id: z.string().max(64).optional(), slug: z.string().max(140).optional() },
  handler: async ({ id, slug }) => {
    if (!id && !slug) throw new Error("NOT_FOUND:give an id or a slug");
    const project = await prisma.project.findFirst({
      where: { deletedAt: null, ...(id ? { id } : { slug }) },
      select: {
        id: true, slug: true, propertyType: true, status: true, location: true, landAreaSqm: true, projectArea: true, totalUnits: true,
        priceFromTHB: true, priceToTHB: true, facilities: true, heroImageUrl: true, gallery: true, brochureUrl: true, masterPlanImageUrl: true,
        googleMapsUrl: true, virtualTourUrl: true, ogImageUrl: true, canonicalUrl: true, isPublished: true, contentStatus: true, updatedAt: true,
        translations: {
          select: { locale: true, name: true, tagline: true, location: true, description: true, conceptDesign: true, aboutThisProject: true, metaTitle: true, metaDescription: true, noIndex: true, targetKeywords: true },
        },
      },
    });
    if (!project) throw new Error("NOT_FOUND");
    const { translations, landAreaSqm, priceFromTHB, priceToTHB, ...facts } = project;
    return {
      ...facts,
      landAreaSqm: num(landAreaSqm),
      priceFromTHB: num(priceFromTHB),
      priceToTHB: num(priceToTHB),
      missingLanguages: missing(translations.map((t) => t.locale)),
      versions: Object.fromEntries(translations.map(({ locale, ...version }) => [locale, version])),
    };
  },
});

defineTool({
  name: "units_list",
  title: "List a project's units",
  description:
    "The units of one project: unit number, type, sales status (AVAILABLE, RESERVED, SOLD, TRANSFERRED), price in THB, land area, facing, view, phase and whether it is released for sale. Who reserved or bought a unit is not included. Filter by status.",
  access: "read",
  capability: "manageProjects",
  input: { projectId: z.string().min(1).max(64), status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "TRANSFERRED"]).optional(), ...page },
  handler: async ({ projectId, status, limit = 50, offset = 0 }) => {
    const where = { projectId, ...(status ? { status } : {}) };
    const [total, rows] = await Promise.all([
      prisma.projectUnit.count({ where }),
      prisma.projectUnit.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
        skip: offset,
        take: limit,
        select: {
          id: true, unitNumber: true, status: true, priceTHB: true, landAreaSqm: true, facing: true, viewLabel: true, phase: true, releasedForSale: true, updatedAt: true,
          unitType: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { total, offset, units: rows.map(({ priceTHB, landAreaSqm, ...row }) => ({ ...row, priceTHB: num(priceTHB), landAreaSqm: num(landAreaSqm) })) };
  },
});

defineTool({
  name: "progress_list",
  title: "List construction progress updates",
  description: "Monthly construction progress updates of one project, newest first: month, year, percent complete, number of photos, whether there is a video, whether it is published, and which languages have text.",
  access: "read",
  capability: "viewContent",
  input: { projectId: z.string().min(1).max(64), ...page },
  handler: async ({ projectId, limit = 24, offset = 0 }) => {
    const rows = await prisma.projectProgress.findMany({
      where: { projectId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      skip: offset,
      take: limit,
      select: { id: true, month: true, year: true, percentComplete: true, images: true, videoUrl: true, isPublished: true, updatedAt: true, translations: { select: { locale: true } } },
    });
    return {
      updates: rows.map(({ images, videoUrl, translations, ...row }) => ({
        ...row,
        photos: images.length,
        hasVideo: Boolean(videoUrl),
        missingLanguages: missing(translations.map((t) => t.locale)),
      })),
    };
  },
});

defineTool({
  name: "ebrochures_list",
  title: "List e-brochures",
  description: "Every e-brochure: id, slug, titles per language, the PDF's url, cover image, the project it belongs to, whether it is published and which languages are missing.",
  access: "read",
  capability: "viewContent",
  input: {},
  handler: async () => {
    const rows = await prisma.eBrochure.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, slug: true, fileUrl: true, coverImageUrl: true, isPublished: true, contentStatus: true, updatedAt: true,
        project: { select: { id: true, slug: true } },
        translations: { select: { locale: true, title: true } },
      },
    });
    return {
      brochures: rows.map(({ translations, ...row }) => ({
        ...row,
        titles: Object.fromEntries(translations.map((t) => [t.locale, t.title])),
        missingLanguages: missing(translations.map((t) => t.locale)),
      })),
    };
  },
});

defineTool({
  name: "events_list",
  title: "List events",
  description:
    "Events, soonest upcoming first then past: id, slug, titles per language, start and end, location, capacity, whether published, and the NUMBER of registrations by status. Who registered is not included.",
  access: "read",
  capability: "viewContent",
  input: { upcomingOnly: z.boolean().optional(), ...page },
  handler: async ({ upcomingOnly, limit = 20, offset = 0 }) => {
    const now = new Date();
    const rows = await prisma.event.findMany({
      where: upcomingOnly ? { startsAt: { gte: now } } : {},
      orderBy: { startsAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true, slug: true, startsAt: true, endsAt: true, location: true, capacity: true, coverImageUrl: true, isPublished: true, contentStatus: true,
        translations: { select: { locale: true, title: true } },
      },
    });
    const counts = await prisma.eventRegistration.groupBy({ by: ["eventId", "status"], where: { eventId: { in: rows.map((r) => r.id) } }, _count: { _all: true }, _sum: { partySize: true } });
    return {
      events: rows.map(({ translations, ...row }) => ({
        ...row,
        upcoming: row.startsAt >= now,
        titles: Object.fromEntries(translations.map((t) => [t.locale, t.title])),
        missingLanguages: missing(translations.map((t) => t.locale)),
        registrations: Object.fromEntries(counts.filter((c) => c.eventId === row.id).map((c) => [c.status, { registrations: c._count._all, people: c._sum.partySize ?? 0 }])),
      })),
    };
  },
});

defineTool({
  name: "event_get",
  title: "Read one event",
  description: "One event in full, by id or slug: schedule, location, capacity, images, published state, and every language version with its title, description, meta title and meta description. Registrations are not included.",
  access: "read",
  capability: "viewContent",
  input: { id: z.string().max(64).optional(), slug: z.string().max(140).optional() },
  handler: async ({ id, slug }) => {
    if (!id && !slug) throw new Error("NOT_FOUND:give an id or a slug");
    const event = await prisma.event.findFirst({
      where: id ? { id } : { slug },
      select: {
        id: true, slug: true, startsAt: true, endsAt: true, location: true, capacity: true, coverImageUrl: true, ogImageUrl: true, isPublished: true, contentStatus: true, updatedAt: true,
        translations: { select: { locale: true, title: true, description: true, metaTitle: true, metaDescription: true, noIndex: true } },
      },
    });
    if (!event) throw new Error("NOT_FOUND");
    const { translations, ...facts } = event;
    return { ...facts, missingLanguages: missing(translations.map((t) => t.locale)), versions: Object.fromEntries(translations.map(({ locale, ...version }) => [locale, version])) };
  },
});
