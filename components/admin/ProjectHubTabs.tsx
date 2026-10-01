/**
 * components/admin/ProjectHubTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The project workspace's header: a photo band with the project's name,
 * tagline, status and public address, and under it the tab strip every
 * project route shares.
 *
 * One project's edit surface is a set of separate routes rather than one
 * mockup-style single-page tab set — each already has its own data
 * fetching and its own form state, and rebuilding them as panels on one
 * page would mean merging that many independent Server Components' data
 * loading into one. What this component does instead is give every route
 * the same header and the same tab bar, so switching between them reads as
 * moving between tabs of one workspace.
 *
 * THE HEADER LIVES HERE, NOT IN EACH PAGE
 *
 * Nine pages each drew their own back link and h1 above this bar, nine
 * slightly different ways — one said "Edit project", one the project name
 * with a published chip, one the status beside it. The v4 band is the same
 * on every tab, so it is drawn once, from its own small read of the
 * project; a page keeps only what is its own (a hint, an action).
 *
 * SEVEN TABS, AS IN THE V4 MOCKUP
 *
 *   ภาพรวม · เนื้อหาและ SEO · แบบบ้าน · ยูนิตและผังโครงการ ·
 *   สิ่งอำนวยความสะดวก · ความคืบหน้า · อีโบรชัวร์      + ดูหน้าเว็บ
 *
 * Content and SEO are one tab over two routes (a segmented control under
 * the strip picks between them), because they edit the same words — the
 * page's copy and how a search result shows it. Units and the site plan
 * likewise: the plan is where units are placed. House types left that
 * group for a tab of their own: they are defined once and reused, not part
 * of placing plots. Every route kept its address.
 *
 * Every tab is a Link to a real route — no client-side panel switching, so
 * there is nothing here that can drift from what each page renders.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { cache } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, ImageOff } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

/** The route a page is — which also decides the highlighted tab. */
export type ProjectHubTabKey =
  | "overview"
  | "content"
  | "seo"
  | "unitTypes"
  | "units"
  | "sitePlan"
  | "facilities"
  | "progress"
  | "brochures";

type TabKey = "overview" | "contentSeo" | "unitTypes" | "unitsPlan" | "facilities" | "progress" | "brochures";

const TAB_OF: Record<ProjectHubTabKey, TabKey> = {
  overview: "overview",
  content: "contentSeo",
  seo: "contentSeo",
  unitTypes: "unitTypes",
  units: "unitsPlan",
  sitePlan: "unitsPlan",
  facilities: "facilities",
  progress: "progress",
  brochures: "brochures",
};

/** The two-route tabs, and their segmented control. */
const SUBNAV: Partial<Record<TabKey, { key: ProjectHubTabKey; segment: string; labelKey: string }[]>> = {
  contentSeo: [
    { key: "content", segment: "/content", labelKey: "projectContent.tab" },
    { key: "seo", segment: "/seo", labelKey: "pageSeo.tab" },
  ],
  unitsPlan: [
    { key: "units", segment: "/units", labelKey: "units.title" },
    { key: "sitePlan", segment: "/site-plan", labelKey: "sitePlan.title" },
  ],
};

const STATUS_TONE: Record<ProjectStatus, string> = {
  UPCOMING: "bg-adm-status-info-bg text-adm-status-info",
  UNDER_CONSTRUCTION: "bg-adm-warning-bg text-adm-warning",
  READY_TO_MOVE_IN: "bg-adm-success-bg text-adm-success",
  SOLD_OUT: "bg-adm-neutral-bg text-adm-neutral",
};

/* cache(): a page that renders the header and reads the same project
   itself costs one round-trip for the header, not one per render. */
const getHeaderProject = cache((projectId: string) =>
  safeQuery(
    "admin:projectHub:header",
    () =>
      prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameTh: true,
          status: true,
          isPublished: true,
          heroImageUrl: true,
          ogImageUrl: true,
          translations: { select: { locale: true, name: true, tagline: true } },
        },
      }),
    null,
  ),
);

type Props = {
  locale: string;
  projectId: string;
  active: ProjectHubTabKey;
};

export default async function ProjectHubTabs({ locale, projectId, active }: Props) {
  const [t, project] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getHeaderProject(projectId),
  ]);

  const base = `/${locale}/admin/projects/${projectId}`;
  const activeTab = TAB_OF[active];

  // This locale, then English, then Thai — the public fallback order.
  const translation =
    project?.translations.find((row) => row.locale === locale) ??
    project?.translations.find((row) => row.locale === "en") ??
    project?.translations.find((row) => row.locale === "th");
  const name = translation?.name || (project ? (locale === "th" ? project.nameTh : project.nameEn) : "");
  const tagline = translation?.tagline ?? null;
  const image = project?.heroImageUrl ?? project?.ogImageUrl ?? null;
  const publicPath = project ? `/${locale}/projects/${project.slug}` : null;

  const tabs: { key: TabKey; href: string; label: string }[] = [
    { key: "overview", href: `${base}/edit`, label: t("projects.hubOverview") },
    { key: "contentSeo", href: `${base}/content`, label: t("projects.hubContentSeo") },
    { key: "unitTypes", href: `${base}/unit-types`, label: t("projects.hubUnitTypes") },
    { key: "unitsPlan", href: `${base}/units`, label: t("projects.hubUnits") },
    { key: "facilities", href: `${base}/facilities`, label: t("facilities.title") },
    { key: "progress", href: `${base}/progress`, label: t("progress.title") },
    { key: "brochures", href: `${base}/brochures`, label: t("eBrochures.title") },
  ];

  const subnav = SUBNAV[activeTab];

  return (
    <div className="space-y-4">
      <Link
        href={`/${locale}/admin/projects`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
      >
        <ArrowLeft size={14} aria-hidden />
        {t("projects.title")}
      </Link>

      {/* The band: the project's own photo under a navy wash, so white type
          reads on any image. */}
      <header className="relative overflow-hidden rounded-card bg-adm-band text-white">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, see ProjectsTable
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        ) : (
          <ImageOff size={64} aria-hidden className="absolute right-6 top-1/2 -translate-y-1/2 text-white/10" />
        )}
        <div className="absolute inset-0 bg-linear-to-r from-adm-band via-adm-band/80 to-transparent" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 py-6 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {project && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[project.status]}`}
                >
                  {t(`projectStatus.${project.status}` as never)}
                </span>
              )}
              {project && (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white">
                  {project.isPublished ? t("common.published") : t("common.draft")}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">{name}</h1>
            {tagline && <p className="mt-1 max-w-2xl text-sm text-white/75">{tagline}</p>}
            {publicPath && <p className="admin-mono mt-2 text-xs text-white/60">{publicPath}</p>}
          </div>

          {project?.isPublished && publicPath && (
            <Link
              href={publicPath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-control bg-white/15 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/25"
            >
              <ExternalLink size={14} aria-hidden />
              {t("projects.viewSite")}
            </Link>
          )}
        </div>
      </header>

      {/* Sticky under the 60px topbar: on a long form the tabs are still
          one click away. */}
      <nav
        aria-label={t("projects.hubLabel")}
        className="sticky top-[60px] z-20 -mx-1 flex gap-1 overflow-x-auto border-b border-adm-line bg-adm-bg/90 px-1 backdrop-blur-md"
      >
        {tabs.map((tab) => {
          const current = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={[
                "relative shrink-0 whitespace-nowrap px-3.5 py-3 text-sm transition-colors",
                current
                  ? "font-semibold text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-adm-fill"
                  : "text-ink-muted hover:text-ink",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {subnav && (
        /* A segmented control, not a second tab bar: two rows of tabs read
           as two peer levels. */
        <nav
          aria-label={tabs.find((tab) => tab.key === activeTab)?.label}
          className="inline-flex rounded-[10px] border border-adm-line bg-surface p-0.5"
        >
          {subnav.map((step) => (
            <Link
              key={step.key}
              href={`${base}${step.segment}`}
              aria-current={step.key === active ? "page" : undefined}
              className={[
                "rounded-[8px] px-3.5 py-1.5 text-[13px] transition-colors",
                step.key === active
                  ? "bg-adm-solid font-medium text-ink shadow-[0_0_0_1px_var(--adm-line)]"
                  : "text-ink-muted hover:text-ink",
              ].join(" ")}
            >
              {t(step.labelKey as never)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
