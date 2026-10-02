/**
 * components/admin/ProjectHubTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The project workspace's header: a band with the project's name, tagline,
 * status and public address over its photo, and under it the tab strip
 * every project route shares.
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
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import AdminImage from "@/components/admin/ui/AdminImage";
import AdminTabs from "@/components/admin/ui/AdminTabs";
import Segmented from "@/components/admin/ui/Segmented";
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
      {/* The band (v4 round two): light on the left where the words are,
          the project's photo fading in from the right — so the heading is
          the page's own text colour, not white on a navy wash. */}
      <header className="admin-card relative flex min-h-[180px] overflow-hidden p-0!">
        {image && (
          <AdminImage
            src={image}
            className="absolute inset-y-0 right-0 h-full w-[60%] object-cover [mask-image:linear-gradient(90deg,transparent,#000_45%)]"
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(90deg,var(--adm-solid)_20%,transparent_75%)]"
        />
        <div className="relative flex min-w-0 flex-col justify-center gap-2 px-6 py-5">
          <Link
            href={`/${locale}/admin/projects`}
            className="inline-flex w-fit items-center gap-1.5 text-xs text-adm-muted hover:text-adm-accent-ink"
          >
            <ArrowLeft size={13} aria-hidden />
            {t("projects.allProjects")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {project && (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[project.status]}`}>
                {t(`projectStatus.${project.status}` as never)}
              </span>
            )}
            {project && (
              <span
                className={[
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                  project.isPublished ? "bg-adm-success-bg text-adm-success" : "bg-adm-neutral-bg text-adm-neutral",
                ].join(" ")}
              >
                {project.isPublished ? t("common.published") : t("common.draft")}
              </span>
            )}
            {publicPath && (
              <span className="admin-mono rounded-full bg-adm-text/6 px-2.5 py-0.5 text-[11px] text-adm-muted">
                {publicPath}
              </span>
            )}
          </div>
          <h1 className="text-[26px] font-semibold leading-tight text-adm-text sm:text-[30px]">{name}</h1>
          {tagline && <p className="max-w-xl text-sm text-adm-muted">{tagline}</p>}
        </div>
      </header>

      {/* Sticky under the 60px topbar: on a long form the tabs are still
          one click away. The live page is the row's last item, as in the
          mockup, rather than a button on the band. */}
      <div className="sticky top-[60px] z-20 -mx-1 bg-adm-bg/90 px-1 backdrop-blur-md">
        <AdminTabs
          className="mb-0!"
          label={t("projects.hubLabel")}
          tabs={tabs.map((tab) => ({ ...tab, active: tab.key === activeTab }))}
          trailing={
            project?.isPublished && publicPath ? (
              <Link href={publicPath} target="_blank" rel="noreferrer" className="admin-btn-quiet admin-btn-sm">
                <ExternalLink size={13} aria-hidden />
                {t("projects.viewSite")}
              </Link>
            ) : undefined
          }
        />
      </div>

      {subnav && (
        /* A segmented control, not a second tab bar: two rows of tabs read
           as two peer levels. */
        <Segmented
          label={tabs.find((tab) => tab.key === activeTab)?.label ?? ""}
          active={active}
          items={subnav.map((step) => ({
            key: step.key,
            label: t(step.labelKey as never),
            href: `${base}${step.segment}`,
          }))}
        />
      )}
    </div>
  );
}
