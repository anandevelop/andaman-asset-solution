/**
 * app/[locale]/admin/(growth)/seo/indexing/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * What crawlers actually do on this site — phase 5's half of it.
 *
 * WHAT THE SITE'S OWN LOGS CAN ANSWER
 *
 * Which crawlers come, how often, what they fetch, and which of our pages
 * none of them has ever asked for. That last list is the most actionable
 * thing on the screen: a page Google has never fetched cannot be indexed,
 * and knowing that needs no Google API at all.
 *
 * AND WHAT THEY CANNOT
 *
 * Whether a crawled page was *indexed*, and whether it earns impressions.
 * Both come from Google — URL Inspection and Search Console, phase 4 — so
 * the funnel's last two steps say "not connected to Google yet" instead of
 * drawing an empty bar. Two empty bars would read as "Google has indexed
 * nothing of ours", which is alarming and false.
 *
 * THE 404 LIST HERE IS NOT THE ONE ON /admin/seo/urls
 *
 * That one is written by a fetch from the 404 boundary in the browser, so
 * it only ever contained dead ends a *person* hit. A crawler runs no
 * JavaScript. Every broken link Googlebot found was invisible in this
 * admin until this page existed, which is why the two lists are separate
 * and say which is which.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bot, ExternalLink, Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { intlLocale } from "@/lib/format";
import { getCrawlOverview } from "@/lib/seo/crawl-report";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-dynamic";

export default async function AdminSeoIndexingPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, crawl] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getCrawlOverview(),
  ]);

  const offline = isDatabaseOffline();

  const seenFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="admin-label mb-0">{t("seo.indexing.title")}</h1>
        <p className="admin-hint">{t("seo.indexing.subtitle", { days: crawl.windowDays })}</p>
      </div>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {crawl.empty ? (
        <section className="admin-card">
          <p className="text-sm text-ink">{t("seo.indexing.empty")}</p>
          <p className="admin-hint mt-1">{t("seo.indexing.emptyHint")}</p>
        </section>
      ) : (
        <>
          <section className="admin-card">
            <h2 className="admin-label">{t("seo.indexing.funnelTitle")}</h2>
            <p className="admin-hint">{t("seo.indexing.funnelHint")}</p>

            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Step label={t("seo.indexing.stepKnown")} value={String(crawl.funnel.known)} />
              <Step label={t("seo.indexing.stepCrawled")} value={String(crawl.funnel.crawled)} />
              {/* Phase 4. Drawn, not omitted — see the header. */}
              <Step label={t("seo.indexing.stepIndexed")} value={t("seo.indexing.notConnected")} muted />
              <Step label={t("seo.indexing.stepEarning")} value={t("seo.indexing.notConnected")} muted />
            </dl>
          </section>

          <section className="admin-card overflow-x-auto">
            <h2 className="admin-label">{t("seo.indexing.botsTitle")}</h2>
            <p className="admin-hint">{t("seo.indexing.botsHint")}</p>

            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="pb-2 font-medium">{t("seo.indexing.columnBot")}</th>
                  <th className="pb-2 text-right font-medium">{t("seo.indexing.columnHits")}</th>
                  <th className="pb-2 text-right font-medium">{t("seo.indexing.columnPaths")}</th>
                  <th className="pb-2 text-right font-medium">{t("seo.indexing.column404")}</th>
                  <th className="pb-2 text-right font-medium">{t("seo.indexing.columnLastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {crawl.activity.map((row) => (
                  <tr key={row.bot} className="border-t border-primary/5">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <Bot size={13} className="text-ink-muted" aria-hidden />
                        {row.bot}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">{row.hits}</td>
                    <td className="py-2 text-right tabular-nums text-ink-muted">{row.paths}</td>
                    <td
                      className={`py-2 text-right tabular-nums ${row.notFound > 0 ? "text-red-700" : "text-ink-muted"}`}
                    >
                      {row.notFound}
                    </td>
                    <td className="py-2 text-right text-xs text-ink-muted">
                      {seenFormat.format(row.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="admin-hint mt-3 flex items-start gap-2">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
              {t("seo.indexing.claimsToBe")}
            </p>
          </section>

          {crawl.notFound.length > 0 && (
            <section className="admin-card overflow-x-auto">
              <h2 className="admin-label">{t("seo.indexing.notFoundTitle")}</h2>
              <p className="admin-hint">{t("seo.indexing.notFoundHint")}</p>

              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="pb-2 font-medium">{t("seo.indexing.columnPath")}</th>
                    <th className="pb-2 font-medium">{t("seo.indexing.columnFoundBy")}</th>
                    <th className="pb-2 text-right font-medium">{t("seo.indexing.columnHits")}</th>
                    <th className="pb-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {crawl.notFound.map((row) => (
                    <tr key={row.path} className="border-t border-primary/5">
                      <td className="py-2 font-mono text-xs text-ink">{row.path}</td>
                      <td className="py-2 text-xs text-ink-muted">{row.bots.join(", ")}</td>
                      <td className="py-2 text-right tabular-nums text-ink">{row.hits}</td>
                      <td className="py-2 text-right">
                        {/*
                          Into the existing redirect form with the path
                          already filled in — not a second redirect form.
                          /admin/seo/urls owns that, and two of them would
                          drift.
                        */}
                        <Link
                          href={`/${locale}/admin/seo/urls?from=${encodeURIComponent(row.path)}`}
                          className="inline-flex items-center gap-1 text-xs text-primary underline"
                        >
                          {t("seo.indexing.addRedirect")}
                          <ExternalLink size={11} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {crawl.uncrawled.length > 0 && (
            <section className="admin-card">
              <h2 className="admin-label">{t("seo.indexing.uncrawledTitle")}</h2>
              <p className="admin-hint">{t("seo.indexing.uncrawledHint")}</p>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {crawl.uncrawled.map((path) => (
                  <li
                    key={path}
                    className="rounded-xs border border-primary/10 px-2 py-1 font-mono text-xs text-ink-muted"
                  >
                    {path}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Step({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-xs border border-primary/10 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd
        className={`mt-1 ${muted ? "text-xs text-ink-muted" : "text-2xl font-semibold tabular-nums text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("seo.indexing.title") };
}
