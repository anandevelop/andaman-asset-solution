/**
 * components/admin/ProjectUnitsSubnav.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The three steps behind one tab: draw the site plan, list the units, name
 * the house types.
 *
 * They were three peer tabs in ProjectHubTabs for what is a single job —
 * and the site plan was not even that: it had no tab, and grepping the
 * whole back office found no link to it from anywhere, so the only way in
 * was to type the URL. A reader of the old tab bar could not tell that
 * "Unit types" and "Units" were two halves of one thing, and could not
 * tell the third half existed at all.
 *
 * Three real routes, not client-side panels, for the same reason as
 * ProjectHubTabs: each already fetches its own data, and the site plan in
 * particular is a canvas tool with its own state.
 *
 * Deliberately styled as a segmented control rather than a second tab bar.
 * Two rows of tabs would read as two peer levels, which is exactly the
 * thing being corrected.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export type ProjectUnitsStep = "sitePlan" | "units" | "unitTypes";

export default async function ProjectUnitsSubnav({
  locale,
  projectId,
  active,
}: {
  locale: string;
  projectId: string;
  active: ProjectUnitsStep;
}) {
  const t = await getTranslations({ locale, namespace: "admin" });

  const base = `/${locale}/admin/projects/${projectId}`;

  const steps: { key: ProjectUnitsStep; href: string; label: string }[] = [
    { key: "sitePlan", href: `${base}/site-plan`, label: t("sitePlan.title") },
    { key: "units", href: `${base}/units`, label: t("units.title") },
    { key: "unitTypes", href: `${base}/unit-types`, label: t("unitTypes.title") },
  ];

  return (
    <nav
      className="inline-flex rounded-xs border border-primary/15 bg-white p-1"
      aria-label={t("projects.hubUnits")}
    >
      {steps.map((step) => (
        <Link
          key={step.key}
          href={step.href}
          aria-current={step.key === active ? "page" : undefined}
          className={[
            "whitespace-nowrap rounded-xs px-3.5 py-1.5 text-sm transition-colors",
            step.key === active
              ? "bg-primary font-semibold text-white"
              : "text-ink-muted hover:text-primary",
          ].join(" ")}
        >
          {step.label}
        </Link>
      ))}
    </nav>
  );
}
