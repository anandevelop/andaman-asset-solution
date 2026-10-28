/**
 * lib/nearby.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The "Nearby" panel on a project page (schools, beaches, activities,
 * lifestyle), per project, editable at /admin/projects/[id]/nearby.
 *
 * Which list a project shows, first match wins:
 *
 *   1. its own categories (NearbyCategory.projectId = the project);
 *   2. the shared list (projectId null), edited at /admin/projects/nearby;
 *   3. the built-in list in content/nearby-attractions.ts.
 *
 * Step 3 is why no seed is needed and no page goes blank: on a database
 * nobody has edited, every project shows what it showed before this
 * existed. The first save of the shared list stores it, and from then on
 * the code list is only the template the editor starts from.
 *
 * This replaced a code-only list. An earlier admin for it was removed by
 * client request because every project used one identical list. It is
 * back because projects now need lists of their own, and a project
 * without one still inherits the shared list, so the common case remains
 * "edit once".
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getNearbyAttractionCategories, NEARBY_DEFAULTS } from "@/content/nearby-attractions";
import type { NearbyAttractionCategorySummary } from "@/lib/projects";
import { formatCoordinateInput } from "@/lib/map-places";

/** The editor's shape: one category with all four labels. */
export type EditableNearbyCategory = {
  labels: { en: string; th: string; zh: string; ru: string };
  /** `pin` is the editor's one-field "lat, lng" text, "" for none. */
  /** `name` is English; `names` the other three, "" for "use English". */
  places: {
    name: string;
    names: { th: string; zh: string; ru: string };
    distanceKm: number;
    durationMin: number;
    pin: string;
  }[];
};

export type NearbySource = "project" | "shared" | "builtIn";

const include = {
  places: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
};
const orderBy = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

type Row = Awaited<ReturnType<typeof readScope>>[number];

function readScope(projectId: string | null) {
  return prisma.nearbyCategory.findMany({ where: { projectId }, orderBy, include });
}

function labelFor(row: Row, locale: string): string {
  const byLocale: Record<string, string> = { en: row.labelEn, th: row.labelTh, zh: row.labelZh, ru: row.labelRu };
  return byLocale[locale]?.trim() || row.labelEn;
}

function placeNameFor(place: Row["places"][number], locale: string): string {
  const byLocale: Record<string, string> = { th: place.nameTh, zh: place.nameZh, ru: place.nameRu };
  return byLocale[locale]?.trim() || place.name;
}

function toSummary(rows: Row[], locale: string): NearbyAttractionCategorySummary[] {
  return rows.map((row, sortOrder) => ({
    id: row.id,
    categoryName: labelFor(row, locale),
    sortOrder,
    items: row.places.map((place) => ({
      id: place.id,
      name: placeNameFor(place, locale),
      nameEn: place.name,
      distanceKm: Number(place.distanceKm),
      durationMin: place.durationMin,
      pin: place.latitude != null && place.longitude != null ? { lat: place.latitude, lng: place.longitude } : null,
    })),
  }));
}

/** The list a project page shows, already in `locale`. */
export async function getNearbyForProject(
  projectId: string,
  locale: string,
): Promise<NearbyAttractionCategorySummary[]> {
  const own = await safeQuery(`nearby:project(${projectId})`, () => readScope(projectId), [] as Row[]);
  if (own.length > 0) return toSummary(own, locale);
  const shared = await safeQuery("nearby:shared", () => readScope(null), [] as Row[]);
  if (shared.length > 0) return toSummary(shared, locale);
  return getNearbyAttractionCategories(locale);
}

function toEditable(rows: Row[]): EditableNearbyCategory[] {
  return rows.map((row) => ({
    labels: { en: row.labelEn, th: row.labelTh, zh: row.labelZh, ru: row.labelRu },
    places: row.places.map((p) => ({
      name: p.name,
      names: { th: p.nameTh, zh: p.nameZh, ru: p.nameRu },
      distanceKm: Number(p.distanceKm),
      durationMin: p.durationMin,
      pin:
        p.latitude != null && p.longitude != null
          ? formatCoordinateInput({ lat: p.latitude, lng: p.longitude })
          : "",
    })),
  }));
}

const builtIn = (): EditableNearbyCategory[] =>
  NEARBY_DEFAULTS.map((category) => ({
    labels: { ...category.categoryName },
    places: category.items.map((item) => ({
      ...item,
      names: { th: "", zh: "", ru: "" },
      pin: formatCoordinateInput(item.pin),
    })),
  }));

/**
 * What the editor opens with for a scope, and where it came from. For a
 * project that has no list of its own, `categories` is the shared list,
 * so "make a list for this project" starts as a copy of what the page
 * already shows.
 */
export async function getNearbyForEditing(
  projectId: string | null,
): Promise<{ source: NearbySource; categories: EditableNearbyCategory[] }> {
  if (projectId) {
    const own = await readScope(projectId);
    if (own.length > 0) return { source: "project", categories: toEditable(own) };
  }
  const shared = await readScope(null);
  if (shared.length > 0) return { source: "shared", categories: toEditable(shared) };
  return { source: "builtIn", categories: builtIn() };
}
