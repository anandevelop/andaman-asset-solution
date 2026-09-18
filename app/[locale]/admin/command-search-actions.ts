"use server";

/**
 * app/[locale]/admin/command-search-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Search behind ⌘K — one server action, a handful of narrow queries run in
 * parallel, each capped and each gated by the same role floor its own
 * admin page already enforces. A VIEWER typing into the palette should
 * never see a lead's name or phone number appear in a result row just
 * because the query matched it — the role check has to happen at the
 * query level, not by hiding the row after the fact.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";

export type SearchHit = {
  id: string;
  group: "projects" | "units" | "leads" | "news" | "events" | "media";
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
};

export type SearchResults = {
  groups: { key: SearchHit["group"]; hits: SearchHit[] }[];
};

const MIN_QUERY_LENGTH = 2;
const PER_GROUP_LIMIT = 6;

export async function commandSearch(locale: string, rawQuery: string): Promise<SearchResults> {
  const session = await requireAdminAction(Role.VIEWER);

  const query = rawQuery.trim();
  if (query.length < MIN_QUERY_LENGTH) return { groups: [] };

  const contains = { contains: query, mode: "insensitive" as const };

  const [projects, units, news, events, media, leads] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null, OR: [{ nameEn: contains }, { nameTh: contains }, { slug: contains }] },
      take: PER_GROUP_LIMIT,
      select: { id: true, nameEn: true, nameTh: true, location: true },
    }),
    prisma.projectUnit.findMany({
      where: { unitNumber: contains },
      take: PER_GROUP_LIMIT,
      select: {
        id: true,
        unitNumber: true,
        status: true,
        projectId: true,
        project: { select: { nameEn: true, nameTh: true } },
      },
    }),
    prisma.newsArticle.findMany({
      where: { deletedAt: null, OR: [{ titleEn: contains }, { titleTh: contains }] },
      take: PER_GROUP_LIMIT,
      select: { id: true, titleEn: true, titleTh: true },
    }),
    prisma.event.findMany({
      where: { OR: [{ titleEn: contains }, { titleTh: contains }] },
      take: PER_GROUP_LIMIT,
      select: { id: true, titleEn: true, titleTh: true, startsAt: true },
    }),
    prisma.media.findMany({
      where: { url: contains },
      take: PER_GROUP_LIMIT,
      select: { id: true, url: true },
    }),
    // Leads carry a customer's name, phone and email — SALES and above
    // only, matching /admin/leads' own guard exactly.
    hasRole(session.role, Role.SALES)
      ? prisma.leadInquiry.findMany({
          where: {
            AND: [
              { OR: [{ name: contains }, { phone: contains }, { email: contains }] },
              session.role === Role.SALES
                ? { OR: [{ assignedToId: null }, { assignedToId: session.id }] }
                : {},
            ],
          },
          take: PER_GROUP_LIMIT,
          select: { id: true, name: true, phone: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const groups: SearchResults["groups"] = [
    {
      key: "projects" as const,
      hits: projects.map((p) => ({
        id: p.id,
        group: "projects" as const,
        title: p.nameEn || p.nameTh,
        subtitle: p.location,
        href: `/admin/projects/${p.id}/edit`,
      })),
    },
    {
      key: "units" as const,
      hits: units.map((u) => ({
        id: u.id,
        group: "units" as const,
        title: u.unitNumber,
        subtitle: u.project.nameEn || u.project.nameTh,
        href: `/admin/projects/${u.projectId}/edit`,
        badge: u.status,
      })),
    },
    {
      key: "leads" as const,
      hits: (leads as { id: string; name: string; phone: string; status: string }[]).map((l) => ({
        id: l.id,
        group: "leads" as const,
        title: l.name,
        subtitle: l.phone,
        href: `/admin/leads/${l.id}`,
        badge: l.status,
      })),
    },
    {
      key: "news" as const,
      hits: news.map((n) => ({
        id: n.id,
        group: "news" as const,
        title: n.titleEn || n.titleTh,
        href: `/admin/news/${n.id}/edit`,
      })),
    },
    {
      key: "events" as const,
      hits: events.map((e) => ({
        id: e.id,
        group: "events" as const,
        title: e.titleEn || e.titleTh,
        href: `/admin/events/${e.id}/edit`,
      })),
    },
    {
      key: "media" as const,
      hits: media.map((m) => ({
        id: m.id,
        group: "media" as const,
        title: decodeURIComponent(m.url.split("/").pop() ?? m.url),
        href: `/admin/media`,
      })),
    },
  ].filter((g) => g.hits.length > 0);

  return { groups };
}
