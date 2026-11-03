/**
 * /admin/seo/schema — "Schema": which structured data each kind of public
 * page carries, where it comes from in the back office, and one-click
 * checks in Google's Rich Results Test and the schema.org validator.
 *
 * The table is the code's own map of what it emits (lib/project-schema.ts,
 * lib/article-schema.ts, lib/structured-media.ts …), so it does not need a
 * scan. Below it, the pages the last audit found with no JSON-LD at all.
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { CircleAlert, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { getAuditUrls } from "@/lib/seo/audit-report";
import { getPublishedProjects } from "@/lib/projects";
import { siteConfig } from "@/config/site";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-dynamic";

const TEMPLATES: { key: string; path: string; types: string[] }[] = [
  { key: "home", path: "", types: ["RealEstateAgent", "FAQPage"] },
  {
    key: "project",
    path: "/projects/{slug}",
    types: ["RealEstateListing", "GatedResidenceCommunity", "SingleFamilyResidence", "RealEstateAgent", "BreadcrumbList", "VideoObject"],
  },
  { key: "news", path: "/news/{slug}", types: ["NewsArticle", "BreadcrumbList"] },
  { key: "event", path: "/events/{slug}", types: ["Event", "BreadcrumbList"] },
  { key: "brochure", path: "/e-brochure/{slug}", types: ["DigitalDocument", "BreadcrumbList"] },
];

const richResults = (url: string) => `https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`;
const validator = (url: string) => `https://validator.schema.org/#url=${encodeURIComponent(url)}`;

export default async function SeoSchemaPage(props: Props) {
  const { locale } = await props.params;
  await requireAdmin(locale, Role.ADMIN);

  const [t, missing, projects] = await Promise.all([
    getTranslations({ locale, namespace: "admin.seo.schema" }),
    getAuditUrls({ locale, ruleKey: "json-ld", limit: 200 }),
    getPublishedProjects("en"),
  ]);

  const sample = (path: string) =>
    `${siteConfig.url}/en${path.replace("{slug}", projects[0]?.slug ?? "")}`;

  const checkLinks = (url: string) => (
    <span className="flex flex-wrap gap-2">
      <a href={richResults(url)} target="_blank" rel="noopener noreferrer" className="admin-btn-ghost admin-btn-sm">
        Rich Results <ExternalLink size={11} aria-hidden />
      </a>
      <a href={validator(url)} target="_blank" rel="noopener noreferrer" className="admin-btn-ghost admin-btn-sm">
        schema.org <ExternalLink size={11} aria-hidden />
      </a>
    </span>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="admin-label mb-0">{t("title")}</h2>
        <p className="admin-hint">{t("subtitle")}</p>
      </div>

      <div className="admin-card overflow-x-auto p-0!">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-adm-line text-left text-xs text-adm-muted">
              <th className="px-4 py-2.5 font-medium">{t("page")}</th>
              <th className="px-4 py-2.5 font-medium">{t("types")}</th>
              <th className="px-4 py-2.5 font-medium">{t("source")}</th>
              <th className="px-4 py-2.5 font-medium">{t("check")}</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATES.map((template) => (
              <tr key={template.key} className="border-b border-adm-line align-top last:border-b-0">
                <td className="px-4 py-3 font-medium text-adm-text">{t(`templates.${template.key}` as never)}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1">
                    {template.types.map((type) => (
                      <code key={type} className="rounded-xs bg-adm-text/5 px-1.5 py-0.5 text-[11px] text-adm-text">
                        {type}
                      </code>
                    ))}
                  </span>
                </td>
                <td className="max-w-[280px] px-4 py-3 text-xs text-adm-muted">{t(`sources.${template.key}` as never)}</td>
                <td className="px-4 py-3">
                  {template.key === "home" || (template.key === "project" && projects[0])
                    ? checkLinks(sample(template.path))
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="admin-card space-y-3">
        <h3 className="text-sm font-semibold text-adm-text">{t("projectsTitle")}</h3>
        <ul className="space-y-2">
          {projects.map((project) => (
            <li key={project.slug} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-adm-text">{project.name}</span>
              {checkLinks(`${siteConfig.url}/en/projects/${project.slug}`)}
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-card space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-adm-text">
          <CircleAlert size={15} className={missing.length ? "text-adm-warning" : "text-adm-success"} aria-hidden />
          {t("missingTitle", { count: missing.length })}
        </h3>
        {missing.length === 0 ? (
          <p className="text-sm text-adm-muted">{t("missingNone")}</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {missing.map((row) => (
              <li key={row.url} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-adm-text">{row.url}</span>
                {checkLinks(`${siteConfig.url}${row.url}`)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
