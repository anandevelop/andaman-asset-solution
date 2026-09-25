/**
 * app/[locale]/admin/(growth)/seo/links/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "สุขภาพลิงก์ภายใน" (Link health) — orphan pages, broken links, redirect
 * chains, and link-building opportunities, all read from the site's own
 * link graph (lib/admin/link-graph.ts's scan) rather than recomputed here.
 *
 * ADMIN and above, the (growth) zone's default floor — matching the
 * sibling /seo, /seo/urls and /seo/keywords screens. Every mutation this
 * page offers (rescan, external check, collapse, add link) already
 * requires the same Role.ADMIN floor in links/actions.ts, so unlike the
 * editor's own Links tab (which EDITOR can also open) there is no
 * additional per-button role check needed here — anyone who can see this
 * page can already use every button on it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Link2, Sparkles, Unlink } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { getLinkHealth } from "@/lib/admin/link-health";
import { findLinkOpportunities } from "@/lib/admin/link-opportunities";
import { intlLocale } from "@/lib/format";
import RescanButton from "@/components/admin/RescanButton";
import { rescanLinkGraph, checkExternalLinks, collapseRedirectChain, addLinkOpportunity } from "./actions";

type Props = { params: Promise<{ locale: string }> };

export default async function LinkHealthPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, health, opportunities] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getLinkHealth(locale),
    findLinkOpportunities(),
  ]);

  const offline = isDatabaseOffline();

  const lastScanLabel = health.lastScan
    ? new Intl.DateTimeFormat(intlLocale(locale), {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(health.lastScan.scannedAt)
    : null;

  const sourceLabel: Record<(typeof health.urlHealth.brokenLinks)[number]["source"], string> = {
    home: t("urls.sources.home"),
    news: t("urls.sources.news"),
    faq: t("urls.sources.faq"),
    project: t("urls.sources.project"),
    event: t("urls.sources.event"),
  };

  const reasonLabel: Record<(typeof health.urlHealth.brokenLinks)[number]["reason"], string> = {
    missing: t("urls.reasons.missing"),
    draft: t("urls.reasons.draft"),
    legacyHost: t("urls.reasons.legacyHost"),
  };

  return (
    <div className="space-y-8">
      {/* See the keywords tab for why this is an h2 with no back link. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-primary">
            <Link2 size={18} strokeWidth={1.75} className="text-accent-700" aria-hidden />
            {t("seo.links.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {health.lastScan
              ? t("seo.links.lastScanHint", { date: lastScanLabel ?? "" })
              : t("seo.links.neverScanned")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <RescanButton
            action={rescanLinkGraph}
            locale={locale}
            label={t("seo.keywords.rescanButton")}
            errorLabel={t("seo.keywords.rescanError")}
          />
          <RescanButton
            action={checkExternalLinks}
            locale={locale}
            label={t("seo.links.checkExternalButton")}
            errorLabel={t("seo.links.checkExternalError")}
          />
        </div>
      </div>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("seo.links.kpiTotalInternalLinks")}
          </p>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-primary">{health.kpis.totalInternalLinks}</p>
        </div>
        <div className={`admin-card ${health.kpis.orphanCount > 0 ? "border-amber-200" : ""}`}>
          <p
            className={`text-xs font-medium uppercase tracking-wide ${health.kpis.orphanCount > 0 ? "text-amber-800" : "text-ink-muted"}`}
          >
            {t("seo.links.kpiOrphans")}
          </p>
          <p
            className={`mt-4 text-3xl font-semibold tabular-nums ${health.kpis.orphanCount > 0 ? "text-amber-800" : "text-primary"}`}
          >
            {health.kpis.orphanCount}
          </p>
        </div>
        <div className={`admin-card ${health.kpis.brokenLinkCount > 0 ? "border-red-200" : ""}`}>
          <p
            className={`text-xs font-medium uppercase tracking-wide ${health.kpis.brokenLinkCount > 0 ? "text-red-700" : "text-ink-muted"}`}
          >
            {t("seo.links.kpiBrokenLinks")}
          </p>
          <p
            className={`mt-4 text-3xl font-semibold tabular-nums ${health.kpis.brokenLinkCount > 0 ? "text-red-700" : "text-primary"}`}
          >
            {health.kpis.brokenLinkCount}
          </p>
        </div>
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("seo.links.kpiActiveRedirects")}
          </p>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-primary">{health.kpis.activeRedirectCount}</p>
        </div>
      </div>

      {/* ── Broken links ─────────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="border-b border-primary/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-primary">{t("urls.brokenTitle")}</h2>
        </div>
        {health.urlHealth.brokenLinks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{t("urls.brokenEmpty")}</p>
        ) : (
          <ul>
            {health.urlHealth.brokenLinks.map((link) => (
              <li key={link.id} className="border-b border-primary/5 px-5 py-3.5 text-sm last:border-b-0">
                <p className="flex flex-wrap items-center gap-1.5 text-primary">
                  <span className="rounded-xs bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {sourceLabel[link.source]}
                  </span>
                  {link.sourceLabel && (
                    <span>{link.sourceLabel.startsWith("#") ? ` ${link.sourceLabel}` : `“${link.sourceLabel}”`}</span>
                  )}
                  <span className="text-ink-muted">→</span>
                  <span className="font-mono text-xs">{link.target}</span>
                  {link.adminHref && (
                    <Link href={`/${locale}${link.adminHref}`} className="ml-auto text-xs font-medium text-accent-700 hover:text-accent-800">
                      {t("seo.issuesFix")}
                    </Link>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">{reasonLabel[link.reason]}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── External link status ─────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="border-b border-primary/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-primary">{t("seo.links.externalStatusTitle")}</h2>
        </div>
        {health.externalLinks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{t("seo.links.externalStatusEmpty")}</p>
        ) : (
          <ul>
            {health.externalLinks.map((link, index) => (
              <li
                key={`${link.fromType}:${link.fromId}:${link.toPath}:${index}`}
                className="border-b border-primary/5 px-5 py-3.5 text-sm last:border-b-0"
              >
                <p className="flex flex-wrap items-center gap-1.5 text-primary">
                  <span className="rounded-xs bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                    {link.httpStatus === 0 ? t("seo.links.externalStatusUnreachable") : link.httpStatus}
                  </span>
                  <span>{link.sourceLabel.startsWith("#") ? ` ${link.sourceLabel}` : `“${link.sourceLabel}”`}</span>
                  <span className="text-ink-muted">→</span>
                  <span className="font-mono text-xs">{link.toPath}</span>
                  {link.adminHref && (
                    <Link href={`/${locale}${link.adminHref}`} className="ml-auto text-xs font-medium text-accent-700 hover:text-accent-800">
                      {t("seo.issuesFix")}
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Orphan pages ─────────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="flex items-center gap-2 border-b border-primary/10 px-5 py-3.5">
          <Unlink size={15} className="text-ink-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-primary">{t("seo.links.orphansTitle")}</h2>
        </div>
        {health.orphans.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{t("seo.links.orphansEmpty")}</p>
        ) : (
          <ul>
            {health.orphans.map((orphan) => (
              <li
                key={`${orphan.contentType}:${orphan.contentId}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/5 px-5 py-3.5 text-sm last:border-b-0"
              >
                <span className="text-ink">{orphan.title}</span>
                <span className="font-mono text-xs text-ink-muted">{orphan.path}</span>
                <Link href={`/${locale}${orphan.adminHref}`} className="text-xs font-medium text-accent-700 hover:text-accent-800">
                  {t("seo.issuesFix")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Redirect chains ──────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="flex items-center gap-2 border-b border-primary/10 px-5 py-3.5">
          <AlertTriangle size={15} className="text-ink-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-primary">{t("seo.links.chainsTitle")}</h2>
        </div>
        {health.chains.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{t("seo.links.chainsEmpty")}</p>
        ) : (
          <ul>
            {health.chains.map((chain) => {
              const root = chain.rows[0]?.fromPath ?? chain.terminal;
              const sequence = [...chain.rows.map((row) => row.fromPath), chain.terminal];
              return (
                <li
                  key={root}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/5 px-5 py-3.5 text-sm last:border-b-0"
                >
                  <span className="font-mono text-xs text-ink">{sequence.join(" → ")}</span>
                  {chain.loop ? (
                    <span className="text-xs font-medium text-red-700">{t("seo.links.chainLoop")}</span>
                  ) : (
                    <RescanButton
                      action={collapseRedirectChain.bind(null, root)}
                      locale={locale}
                      label={t("seo.links.collapseButton")}
                      errorLabel={t("seo.links.collapseError")}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Link-building opportunities ──────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="flex items-center gap-2 border-b border-primary/10 px-5 py-3.5">
          <Sparkles size={15} className="text-ink-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-primary">{t("seo.links.opportunitiesTitle")}</h2>
        </div>
        {opportunities.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{t("seo.links.opportunitiesEmpty")}</p>
        ) : (
          <ul>
            {opportunities.map((opportunity) => (
              <li
                key={opportunity.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/5 px-5 py-3.5 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-ink">
                    <Link
                      href={`/${locale}/admin/news/${opportunity.sourceId}/edit`}
                      className="font-medium text-primary hover:text-accent-700"
                    >
                      {opportunity.sourceTitle}
                    </Link>{" "}
                    <span className="text-ink-muted" aria-hidden>
                      →
                    </span>{" "}
                    {opportunity.targetTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {t("seo.links.opportunityMention", { text: opportunity.matchedText })}
                  </p>
                </div>
                <RescanButton
                  action={addLinkOpportunity.bind(null, {
                    sourceId: opportunity.sourceId,
                    sourceLocale: opportunity.sourceLocale,
                    targetType: opportunity.targetType,
                    targetId: opportunity.targetId,
                    targetPath: opportunity.targetPath,
                  })}
                  locale={locale}
                  label={t("seo.links.addLinkButton")}
                  errorLabel={t("seo.links.addLinkError")}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
