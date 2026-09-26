/**
 * app/[locale]/admin/(growth)/seo/urls/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "URL และการเปลี่ยนเส้นทาง" (Urls.dc.html).
 *
 * Under /admin/seo rather than /admin/settings, where it used to live: a
 * redirect is not a setting anybody changes once, it is the other half of
 * the SEO work on the tab next door, and the breadcrumb in the design says
 * so. For a while after that move nothing linked here at all — settings
 * had dropped its link and the SEO overview never gained one — which is
 * what the hub's tab strip, one folder up, now fixes.
 *
 * ADMIN and above — a wrong redirect sends a section of the site
 * somewhere else for search engines as well as people, quietly, for as
 * long as nobody notices.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { getUrlHealth, redirectsToCsv, HIT_WINDOW_DAYS } from "@/lib/admin/url-health";
import UrlRedirectManager from "@/components/admin/UrlRedirectManager";

type Props = {
  params: Promise<{ locale: string }>;
  /** `?from=` carries a path in from the indexing tab's "add a redirect"
   *  shortcut, so the form opens already filled in. */
  searchParams: Promise<{ from?: string }>;
};

export default async function AdminUrlsPage(props: Props) {
  const { locale } = await props.params;
  const { from } = await props.searchParams;

  /* Only a path, and only a plausible one. The value arrives in a URL
     anybody can edit, and it is about to be put into a form field that
     writes a redirect — a bare "/..." is the whole shape that makes sense
     here, so anything else is simply ignored rather than corrected. */
  const prefillFrom = from && from.startsWith("/") && from.length <= 500 ? from : undefined;

  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  const health = await getUrlHealth();

  return (
    <div className="space-y-6">
      {/* See the keywords tab for why this is an h2 with no back link. */}
      <div>
        <h2 className="text-lg font-semibold text-primary">{t("urls.title")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">{t("urls.subtitle")}</p>
      </div>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <UrlRedirectManager
        locale={locale}
        redirects={health.redirects}
        notFound={health.notFound}
        notFoundTotal={health.notFoundTotal}
        hiddenCount={health.hiddenCount}
        brokenLinks={health.brokenLinks}
        externalLinkCount={health.externalLinkCount}
        csv={redirectsToCsv(health.redirects)}
        prefillFrom={prefillFrom}
        labels={{
          tabs: {
            redirects: t("urls.tabs.redirects"),
            notFound: t("urls.tabs.notFound", { days: HIT_WINDOW_DAYS }),
            brokenLinks: t("urls.tabs.brokenLinks"),
          },
          add: t("urls.add"),
          importCsv: t("urls.importCsv"),
          export: t("urls.export"),
          from: t("urls.from"),
          to: t("urls.to"),
          type: t("urls.type"),
          origin: t("urls.origin"),
          hits30: t("urls.hits30", { days: HIT_WINDOW_DAYS }),
          hitsTotalShort: t("urls.hitsTotalShort"),
          autoSlug: t("urls.autoSlug"),
          manual: t("urls.manual"),
          note: t("urls.note"),
          notePlaceholder: t("urls.notePlaceholder"),
          expires: t("urls.expires"),
          expiresOn: t("urls.expiresOn"),
          expired: t("urls.expired"),
          inactive: t("urls.inactive"),
          activate: t("urls.activate"),
          deactivate: t("urls.deactivate"),
          edit: t("common.edit"),
          delete: t("common.delete"),
          confirmDelete: t("urls.confirmDelete"),
          save: t("common.save"),
          cancel: t("common.cancel"),
          destinationMissing: t("urls.destinationMissing"),
          destinationDraft: t("urls.destinationDraft"),
          emptyRedirects: t("urls.emptyRedirects"),
          notFoundTitle: t("urls.notFoundTitle", { days: HIT_WINDOW_DAYS }),
          notFoundEmpty: t("urls.notFoundEmpty"),
          hiddenCount: t("urls.hiddenCount", { count: health.hiddenCount }),
          showHidden: t("urls.showHidden"),
          publishRecord: t("urls.publishRecord"),
          create301: t("urls.create301"),
          pointAtFile: t("urls.pointAtFile"),
          hide: t("urls.hide"),
          kindDraft: t("urls.kinds.draft"),
          kindTypo: t("urls.kinds.typo"),
          kindFile: t("urls.kinds.file"),
          kindBot: t("urls.kinds.bot"),
          kindUnknown: t("urls.kinds.unknown"),
          fromReferer: t("urls.fromReferer"),
          brokenTitle: t("urls.brokenTitle"),
          brokenEmpty: t("urls.brokenEmpty"),
          reasonMissing: t("urls.reasons.missing"),
          reasonDraft: t("urls.reasons.draft"),
          reasonLegacyHost: t("urls.reasons.legacyHost"),
          sourceHome: t("urls.sources.home"),
          sourceNews: t("urls.sources.news"),
          sourceFaq: t("urls.sources.faq"),
          sourceProject: t("urls.sources.project"),
          sourceEvent: t("urls.sources.event"),
          externalNote: t("urls.externalNote", { count: health.externalLinkCount }),
          seeAll: t("urls.seeAll"),
          importPrompt: t("urls.importPrompt"),
          errors: {
            LOOP: t("urls.errors.loop"),
            CHAIN: t("urls.errors.chain"),
            DUPLICATE: t("urls.errors.duplicate"),
            INVALID_INPUT: t("urls.errors.invalidInput"),
            INVALID_DATE: t("urls.errors.invalidDate"),
            EMPTY_FILE: t("urls.errors.emptyFile"),
            TOO_MANY_ROWS: t("urls.errors.tooManyRows"),
            IMPORT_FAILED: t("urls.errors.importFailed"),
            UNKNOWN: t("common.error"),
          },
        }}
      />

      {/* The promise the design's footer makes, stated where it is kept. */}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          {t("urls.footerAuto")}
          {health.countingSince && (
            <>
              {" "}
              {t("urls.countingSince", {
                date: new Date(health.countingSince).toLocaleDateString(
                  locale === "th" ? "th-TH" : locale,
                  { day: "numeric", month: "long", year: "numeric" },
                ),
              })}
            </>
          )}{" "}
          {t("urls.footerStatus")}
        </span>
      </p>
    </div>
  );
}
