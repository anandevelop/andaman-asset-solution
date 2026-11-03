/**
 * /admin/seo/meta — "Meta ทุกหน้า": the title, description and share image
 * of every public URL in one language at a time, with lengths and a link
 * to the screen that edits each.
 *
 * Read from the rows (lib/seo/collect.ts, the audit's own list), so it is
 * current the moment something is saved — no scan needed. Static pages
 * have no row: their title and description come from the page copy and
 * SEO → Settings, which this says rather than showing them as empty.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { collectUrls } from "@/lib/seo/collect";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { locales } from "@/i18n";
import { TITLE_MAX_LENGTH } from "@/lib/seo/rules/title-length";
import { siteConfig } from "@/config/site";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; filter?: string }> };

export const dynamic = "force-dynamic";

const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

const EDIT: Record<string, string> = {
  PROJECT: "projects",
  NEWS_ARTICLE: "news",
  EVENT: "events",
  E_BROCHURE: "e-brochures",
};

export default async function SeoMetaPage(props: Props) {
  const { locale } = await props.params;
  const { lang: rawLang, filter } = await props.searchParams;
  await requireAdmin(locale, Role.ADMIN);
  const [t, tAdmin] = await Promise.all([
    getTranslations({ locale, namespace: "admin.seo.meta" }),
    getTranslations({ locale, namespace: "admin" }),
  ]);

  const lang = (locales as readonly string[]).includes(rawLang ?? "") ? rawLang! : locale;
  const all = await safeQuery("seo:meta", () => collectUrls(true), []);
  const rows = all
    .filter((row) => row.locale === lang)
    .map((row) => {
      const issues: string[] = [];
      if (row.entityType) {
        if (!row.title) issues.push("noTitle");
        else if (row.title.length > TITLE_MAX_LENGTH) issues.push("longTitle");
        if (!row.metaDescription) issues.push("noDescription");
        else if (row.metaDescription.length < DESCRIPTION_MIN) issues.push("shortDescription");
        else if (row.metaDescription.length > DESCRIPTION_MAX) issues.push("longDescription");
        if (!row.ogImageUrl) issues.push("noImage");
      }
      return { ...row, issues };
    })
    .filter((row) => filter !== "issues" || row.issues.length > 0);

  const tab = (href: string, active: boolean, label: string) => (
    <Link
      key={href}
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active ? "border-adm-strong bg-adm-strong text-adm-on-strong" : "border-adm-line text-adm-muted hover:text-adm-text"
      }`}
    >
      {label}
    </Link>
  );
  const base = `/${locale}/admin/seo/meta`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-label mb-0">{t("title")}</h2>
        <p className="admin-hint">{t("subtitle", { max: TITLE_MAX_LENGTH, min: DESCRIPTION_MIN, dmax: DESCRIPTION_MAX })}</p>
      </div>

      {/* An empty table here would otherwise read as "every page is fine". */}
      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {tAdmin("common.offline")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {locales.map((l) => tab(`${base}?lang=${l}${filter ? `&filter=${filter}` : ""}`, l === lang, l.toUpperCase()))}
        <span className="mx-1 h-4 w-px bg-adm-line" />
        {tab(`${base}?lang=${lang}`, filter !== "issues", t("all"))}
        {tab(`${base}?lang=${lang}&filter=issues`, filter === "issues", t("onlyIssues"))}
      </div>

      <div className="admin-card overflow-x-auto p-0!">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-adm-line text-left text-xs text-adm-muted">
              <th className="px-4 py-2.5 font-medium">{t("page")}</th>
              <th className="px-4 py-2.5 font-medium">{t("metaTitle")}</th>
              <th className="px-4 py-2.5 font-medium">{t("metaDescription")}</th>
              <th className="px-4 py-2.5 font-medium">{t("image")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const edit = row.entityType && row.entityId && EDIT[row.entityType]
                ? `/${locale}/admin/${EDIT[row.entityType]}/${row.entityId}/${row.entityType === "PROJECT" ? "seo" : "edit"}?lang=${lang}`
                : `/${locale}/admin/seo/defaults`;
              return (
                <tr key={row.url} className="border-b border-adm-line align-top last:border-b-0">
                  <td className="px-4 py-3">
                    <a
                      href={`${siteConfig.url}${row.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-adm-accent-ink hover:underline"
                    >
                      {row.url}
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  </td>
                  {row.entityType ? (
                    <>
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="text-adm-text">{row.title || <span className="text-adm-danger">{t("missing")}</span>}</p>
                        {row.title && (
                          <p className={`text-[11px] ${row.title.length > TITLE_MAX_LENGTH ? "text-adm-warning" : "text-adm-muted"}`}>
                            {row.title.length}/{TITLE_MAX_LENGTH}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[340px] px-4 py-3">
                        <p className="line-clamp-3 text-adm-text">
                          {row.metaDescription || <span className="text-adm-danger">{t("missing")}</span>}
                        </p>
                        {row.metaDescription && (
                          <p
                            className={`text-[11px] ${
                              row.metaDescription.length < DESCRIPTION_MIN || row.metaDescription.length > DESCRIPTION_MAX
                                ? "text-adm-warning"
                                : "text-adm-muted"
                            }`}
                          >
                            {row.metaDescription.length}/{DESCRIPTION_MAX}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.ogImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.ogImageUrl} alt="" className="h-10 w-16 rounded-xs object-cover" loading="lazy" />
                        ) : (
                          <span className="text-xs text-adm-danger">{t("missing")}</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-4 py-3 text-xs text-adm-muted">
                      {t("staticPage")}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <Link href={edit} className="admin-btn-ghost admin-btn-sm">
                      {t("edit")}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-adm-muted">{t("empty")}</p>}
      </div>
    </div>
  );
}
