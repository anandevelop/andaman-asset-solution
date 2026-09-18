/**
 * components/admin/ProjectHubTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One project's edit surface is 5 separate routes (Overview, Unit Types,
 * Units & Site Plan, Facilities, Construction Progress) rather than one
 * mockup-style single-page tab set — each already has its own data
 * fetching, its own form state, and (for Progress) lives under a
 * different route tree entirely (/admin/progress/[projectId], not
 * /admin/projects/[id]/…). Rebuilding all five as panels on one page
 * would mean merging five independent Server Components' data loading
 * into one, which is a much bigger and riskier change than what this
 * component actually does: give every one of those five pages the same
 * tab bar, so switching between them reads as moving between tabs of one
 * project workspace instead of navigating a scattered set of admin pages.
 *
 * A plain server component — every "tab" is a Link to a real route, no
 * client-side panel switching, so there is nothing here that can get out
 * of sync with what each page actually renders.
 *
 * The mockup (ProjectHub.dc.html) shows 8 tabs. Media & gallery is still
 * a field inside the Overview form (see ProjectForm.tsx: ImageUploader and
 * the gallery live on it), so it folds into the Overview tab rather than
 * getting a route that does not otherwise exist. The other two — 4-language
 * content and SEO — have since grown into real routes of their own, each
 * because it needs several languages on screen at once, which the
 * one-language-at-a-time Overview form cannot show.
 */

import Link from "next/link";

export type ProjectHubTabKey =
  | "overview"
  | "content"
  | "seo"
  | "unitTypes"
  | "units"
  | "facilities"
  | "progress";

type Props = {
  locale: string;
  projectId: string;
  active: ProjectHubTabKey;
  labels: Record<ProjectHubTabKey, string>;
};

export default function ProjectHubTabs({ locale, projectId, active, labels }: Props) {
  const tabs: { key: ProjectHubTabKey; href: string }[] = [
    { key: "overview", href: `/${locale}/admin/projects/${projectId}/edit` },
    { key: "content", href: `/${locale}/admin/projects/${projectId}/content` },
    { key: "seo", href: `/${locale}/admin/projects/${projectId}/seo` },
    { key: "unitTypes", href: `/${locale}/admin/projects/${projectId}/unit-types` },
    { key: "units", href: `/${locale}/admin/projects/${projectId}/units` },
    { key: "facilities", href: `/${locale}/admin/projects/${projectId}/facilities` },
    { key: "progress", href: `/${locale}/admin/progress/${projectId}` },
  ];

  return (
    <nav
      className="mt-5 flex gap-1 overflow-x-auto border-b border-primary/10"
      aria-label={labels.overview ? undefined : undefined}
    >
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
          {labels[tab.key]}
        </Link>
      ))}
    </nav>
  );
}
