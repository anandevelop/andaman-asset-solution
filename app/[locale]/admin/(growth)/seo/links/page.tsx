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
import { AlertTriangle, ArrowRightLeft, Link2, Unlink, Unplug } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { getLinkHealth } from "@/lib/admin/link-health";
import { findLinkOpportunities, PER_ARTICLE_LIMIT } from "@/lib/admin/link-opportunities";
import { intlLocale } from "@/lib/format";
import RescanButton from "@/components/admin/RescanButton";
import LinkSuggestions from "@/components/admin/LinkSuggestions";
import {
  rescanLinkGraph,
  checkExternalLinks,
  collapseRedirectChain,
  addLinkOpportunity,
  addAllLinkOpportunities,
  dismissLinkOpportunity,
} from "./actions";

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
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-adm-text">
            <Link2 size={18} strokeWidth={1.75} className="text-adm-accent-ink" aria-hidden />
            {t("seo.links.title")}
          </h2>
          <p className="mt-1 text-sm text-adm-muted">
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
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            {
              key: "total",
              icon: Link2,
              label: t("seo.links.kpiTotalInternalLinks"),
              value: health.kpis.totalInternalLinks,
              hint: t("seo.links.kpiTotalHint", { count: health.kpis.sourcesWithLinks }),
              tone: "",
            },
            {
              key: "broken",
              icon: Unplug,
              label: t("seo.links.kpiBrokenLinks"),
              value: health.kpis.brokenLinkCount,
              hint: t("seo.links.kpiBrokenHint"),
              tone: health.kpis.brokenLinkCount > 0 ? "text-adm-danger" : "",
            },
            {
              key: "redirect",
              icon: ArrowRightLeft,
              label: t("seo.links.kpiThroughRedirect"),
              value: health.kpis.throughRedirectCount,
              hint: t("seo.links.kpiThroughRedirectHint"),
              tone: health.kpis.throughRedirectCount > 0 ? "text-adm-warning" : "",
            },
            {
              key: "orphans",
              icon: Unlink,
              label: t("seo.links.kpiOrphans"),
              value: health.kpis.orphanCount,
              hint: t("seo.links.kpiOrphansHint"),
              tone: health.kpis.orphanCount > 0 ? "text-adm-warning" : "",
            },
          ] as const
        ).map(({ key, icon: Icon, label, value, hint, tone }) => (
          <div key={key} className="admin-card">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-adm-muted">{label}</p>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-adm-solid shadow-[0_0_0_1px_var(--adm-line)]">
                <Icon size={16} className="text-adm-text" aria-hidden />
              </span>
            </div>
            <p className={`mt-3 text-3xl font-semibold tabular-nums ${tone || "text-adm-text"}`}>{value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-adm-muted">{hint}</p>
          </div>
        ))}
      </div>

      {/* ── Suggestions: mentions that are not links yet ─────────────── */}
      <LinkSuggestions
        locale={locale}
        rows={opportunities.map(
          ({ id, via, sourceId, sourceLocale, sourceTitle, targetType, targetId, targetTitle, targetPath, matchedText }) => ({
            id,
            via,
            sourceId,
            sourceLocale,
            sourceTitle,
            targetType,
            targetId,
            targetTitle,
            targetPath,
            matchedText,
          }),
        )}
        labels={{
          title: t("seo.links.suggest.title"),
          subtitle: t("seo.links.suggest.subtitle"),
          rules: t("seo.links.suggest.rules", { max: PER_ARTICLE_LIMIT }),
          search: t("seo.links.suggest.search"),
          applyAll: t.raw("seo.links.suggest.applyAll") as string,
          applyAllConfirm: t.raw("seo.links.suggest.applyAllConfirm") as string,
          appliedAll: t.raw("seo.links.suggest.appliedAll") as string,
          colArticle: t("seo.links.suggest.colArticle"),
          colAnchor: t("seo.links.suggest.colAnchor"),
          colTarget: t("seo.links.suggest.colTarget"),
          apply: t("seo.links.suggest.apply"),
          skip: t("seo.links.suggest.skip"),
          keyword: t("seo.links.suggest.keyword"),
          empty: t("seo.links.opportunitiesEmpty"),
          noMatch: t("seo.links.suggest.noMatch"),
          error: t("seo.links.addLinkError"),
        }}
        addOne={addLinkOpportunity}
        addAll={addAllLinkOpportunities}
        dismiss={dismissLinkOpportunity}
      />

      {/* ── Broken links ─────────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="border-b border-adm-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-adm-text">{t("urls.brokenTitle")}</h2>
        </div>
        {health.urlHealth.brokenLinks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-adm-muted">{t("urls.brokenEmpty")}</p>
        ) : (
          <ul>
            {health.urlHealth.brokenLinks.map((link) => (
              <li key={link.id} className="border-b border-adm-line px-5 py-3.5 text-sm last:border-b-0">
                <p className="flex flex-wrap items-center gap-1.5 text-adm-text">
                  <span className="rounded-xs bg-adm-text/4 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-adm-muted">
                    {sourceLabel[link.source]}
                  </span>
                  {link.sourceLabel && (
                    <span>{link.sourceLabel.startsWith("#") ? ` ${link.sourceLabel}` : `“${link.sourceLabel}”`}</span>
                  )}
                  <span className="text-adm-muted">→</span>
                  <span className="font-mono text-xs">{link.target}</span>
                  {link.adminHref && (
                    <Link href={`/${locale}${link.adminHref}`} className="ml-auto text-xs font-medium text-adm-accent-ink hover:text-adm-accent-ink">
                      {t("seo.issuesFix")}
                    </Link>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-adm-muted">{reasonLabel[link.reason]}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Links that go through a redirect ─────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="flex items-center gap-2 border-b border-adm-line px-5 py-3.5">
          <ArrowRightLeft size={15} className="text-adm-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-adm-text">{t("seo.links.redirectedTitle")}</h2>
        </div>
        {health.redirectedLinks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-adm-muted">{t("seo.links.redirectedEmpty")}</p>
        ) : (
          <ul>
            {health.redirectedLinks.map((link, index) => (
              <li
                key={`${link.fromType}:${link.fromId}:${link.toPath}:${index}`}
                className="flex flex-wrap items-center gap-1.5 border-b border-adm-line px-5 py-3.5 text-sm last:border-b-0"
              >
                <span className="text-adm-text">{link.sourceLabel}</span>
                <span className="text-adm-muted">·</span>
                <span className="font-mono text-xs text-adm-muted line-through">{link.toPath}</span>
                <span className="text-adm-muted">→</span>
                <span className="font-mono text-xs text-adm-text">{link.finalPath}</span>
                {link.adminHref && (
                  <Link href={`/${locale}${link.adminHref}`} className="ml-auto text-xs font-medium text-adm-accent-ink">
                    {t("seo.issuesFix")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── External link status ─────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="border-b border-adm-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-adm-text">{t("seo.links.externalStatusTitle")}</h2>
        </div>
        {health.externalLinks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-adm-muted">{t("seo.links.externalStatusEmpty")}</p>
        ) : (
          <ul>
            {health.externalLinks.map((link, index) => (
              <li
                key={`${link.fromType}:${link.fromId}:${link.toPath}:${index}`}
                className="border-b border-adm-line px-5 py-3.5 text-sm last:border-b-0"
              >
                <p className="flex flex-wrap items-center gap-1.5 text-adm-text">
                  <span className="rounded-xs bg-adm-danger-bg px-1.5 py-0.5 text-[10px] font-semibold text-adm-danger">
                    {link.httpStatus === 0 ? t("seo.links.externalStatusUnreachable") : link.httpStatus}
                  </span>
                  <span>{link.sourceLabel.startsWith("#") ? ` ${link.sourceLabel}` : `“${link.sourceLabel}”`}</span>
                  <span className="text-adm-muted">→</span>
                  <span className="font-mono text-xs">{link.toPath}</span>
                  {link.adminHref && (
                    <Link href={`/${locale}${link.adminHref}`} className="ml-auto text-xs font-medium text-adm-accent-ink hover:text-adm-accent-ink">
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
        <div className="flex items-center gap-2 border-b border-adm-line px-5 py-3.5">
          <Unlink size={15} className="text-adm-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-adm-text">{t("seo.links.orphansTitle")}</h2>
        </div>
        {health.orphans.length === 0 ? (
          <p className="px-5 py-6 text-sm text-adm-muted">{t("seo.links.orphansEmpty")}</p>
        ) : (
          <ul>
            {health.orphans.map((orphan) => (
              <li
                key={`${orphan.contentType}:${orphan.contentId}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-5 py-3.5 text-sm last:border-b-0"
              >
                <span className="text-adm-text">{orphan.title}</span>
                <span className="font-mono text-xs text-adm-muted">{orphan.path}</span>
                <Link href={`/${locale}${orphan.adminHref}`} className="text-xs font-medium text-adm-accent-ink hover:text-adm-accent-ink">
                  {t("seo.issuesFix")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Redirect chains ──────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="flex items-center gap-2 border-b border-adm-line px-5 py-3.5">
          <AlertTriangle size={15} className="text-adm-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-adm-text">{t("seo.links.chainsTitle")}</h2>
        </div>
        {health.chains.length === 0 ? (
          <p className="px-5 py-6 text-sm text-adm-muted">{t("seo.links.chainsEmpty")}</p>
        ) : (
          <ul>
            {health.chains.map((chain) => {
              const root = chain.rows[0]?.fromPath ?? chain.terminal;
              const sequence = [...chain.rows.map((row) => row.fromPath), chain.terminal];
              return (
                <li
                  key={root}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-adm-line px-5 py-3.5 text-sm last:border-b-0"
                >
                  <span className="font-mono text-xs text-adm-text">{sequence.join(" → ")}</span>
                  {chain.loop ? (
                    <span className="text-xs font-medium text-adm-danger">{t("seo.links.chainLoop")}</span>
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

    </div>
  );
}
