/**
 * components/admin/ProjectHubTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One project's edit surface is a set of separate routes rather than one
 * mockup-style single-page tab set — each already has its own data
 * fetching and its own form state, and rebuilding them as panels on one
 * page would mean merging that many independent Server Components' data
 * loading into one. What this component does instead: give every one of
 * those routes the same tab bar, so switching between them reads as moving
 * between tabs of one project workspace.
 *
 * EVERY TAB IS NOW UNDER /projects/[id]
 *
 * It was not. "Progress" pointed at /admin/progress/[projectId], a
 * different route tree, so opening the tab moved the sidebar highlight off
 * Projects and left the URL disagreeing with the tab bar still on screen.
 * That page moved; the cross-project progress list kept the old path.
 *
 * SEVEN TABS, NOT NINE
 *
 * Unit types, units and the site plan were three peers in this bar for
 * what is one job done in three steps — and the site plan was worse than
 * that, because it was not in the bar at all and nothing else in the back
 * office linked to it either, so the only way to reach it was to know the
 * URL. They are one tab now, with ProjectUnitsSubnav choosing between the
 * three underneath it. Landing on the site plan makes the screen that had
 * no entrance the one you see first.
 *
 * E-brochures joined for the opposite reason: a brochure has a projectId,
 * so it was already part of a project, but it was a top-level sidebar row
 * and nothing connected the two.
 *
 * A plain server component — every "tab" is a Link to a real route, no
 * client-side panel switching, so there is nothing here that can get out
 * of sync with what each page actually renders. It reads its own labels
 * rather than taking them as a prop: seven callers each passing the same
 * object meant adding a tab was a seven-file change, and one of them
 * always got a stale copy.
 *
 * The mockup (ProjectHub.dc.html) shows 8 tabs. Media & gallery is still a
 * field inside the Overview form (see ProjectForm.tsx: ImageUploader and
 * the gallery live on it), so it folds into Overview rather than getting a
 * route that does not otherwise exist.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export type ProjectHubTabKey =
  | "overview"
  | "content"
  | "seo"
  | "units"
  | "facilities"
  | "progress"
  | "brochures";

type Props = {
  locale: string;
  projectId: string;
  active: ProjectHubTabKey;
};

export default async function ProjectHubTabs({ locale, projectId, active }: Props) {
  const t = await getTranslations({ locale, namespace: "admin" });

  const base = `/${locale}/admin/projects/${projectId}`;

  const tabs: { key: ProjectHubTabKey; href: string; label: string }[] = [
    { key: "overview", href: `${base}/edit`, label: t("projects.hubOverview") },
    { key: "content", href: `${base}/content`, label: t("projectContent.tab") },
    { key: "seo", href: `${base}/seo`, label: t("pageSeo.tab") },
    // The site plan, not the unit list: it is the step that had no way in.
    { key: "units", href: `${base}/site-plan`, label: t("projects.hubUnits") },
    { key: "facilities", href: `${base}/facilities`, label: t("facilities.title") },
    { key: "progress", href: `${base}/progress`, label: t("progress.title") },
    { key: "brochures", href: `${base}/brochures`, label: t("eBrochures.title") },
  ];

  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-primary/10" aria-label={t("projects.hubLabel")}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={
            tab.key === active
              ? "shrink-0 whitespace-nowrap border-b-2 border-primary px-3.5 py-2.5 text-sm font-semibold text-primary"
              : "shrink-0 whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm text-ink-muted transition-colors hover:text-primary"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
