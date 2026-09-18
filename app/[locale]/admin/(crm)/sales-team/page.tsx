/**
 * app/[locale]/admin/sales-team/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sales team: add at the top, every existing person editable in place —
 * same arrangement as /admin/pages/faq. Reordering is the sortOrder field on
 * each form, not drag-and-drop, matching every other list in this admin
 * (progress months, FAQs).
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import {
  getSalesPerformance,
  PERFORMANCE_WINDOW_DAYS,
  SLOW_RESPONSE_MS,
} from "@/lib/admin/sales-performance";

/** Below this percentage answered inside the fast window, the table draws
 *  the bar red and the note below it may fire. */
const SLOW_RESPONSE_RATE_THRESHOLD = 60;
import { getRoutingRules } from "@/lib/lead-routing";
import { hasRole } from "@/lib/role-rank";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import { Role } from "@prisma/client";
import SalesTeamCards, { type TeamCardMember } from "@/components/admin/SalesTeamCards";
import SalesTeamPerformance from "@/components/admin/SalesTeamPerformance";
import LeadRoutingPanel from "@/components/admin/LeadRoutingPanel";
import { createSalesPerson, deleteSalesPerson, updateSalesPerson } from "./actions";
import SalesPersonForm from "@/components/admin/SalesPersonForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminSalesTeamPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  /*
    SALES, not the default EDITOR.

    The link sits under "Sales & Leads", and a rep could not open it — they
    could not see the roster of the team they are on. Reading it is the
    part they need; changing it is not, and the actions in ./actions.ts
    still require EDITOR to create or update and ADMIN to delete, so the
    guard here only decides who may look.

    `canEditRoster` below keeps the forms in step with those actions. A
    role that may open this page but not save from it should not be shown
    the form — that is the same defect as a menu item leading to a page
    that refuses you.
  */
  const session = await requireAdmin(locale, Role.SALES);
  const canEditRoster = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;
  const lang = parseEditingLocale(searchParams.lang);

  const team = await safeQuery(
    "admin:salesPeople",
    () =>
      db.salesPerson.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true, staffAccount: { select: { id: true, name: true } } },
      }),
    [] as any[],
  );

  // ── Dashboard data ────────────────────────────────────────────────────
  const [performance, routingRules] = await Promise.all([
    getSalesPerformance(
      locale,
      team.map((person: any) => ({ id: person.id, userId: person.staffAccount?.id ?? null })),
    ),
    getRoutingRules(),
  ]);

  /** "1 ชม. 24 น." — the shape the cards show an average response in. */
  const durationLabel = (ms: number | null): string | null => {
    if (ms === null) return null;
    const totalMinutes = Math.round(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? t("salesTeam.durationHm", { hours, minutes })
      : t("salesTeam.durationM", { minutes });
  };

  const nameFor = (person: any) =>
    locale === "th" ? person.nameTh : person.nameEn;

  const cards: TeamCardMember[] = team.map((person: any) => {
    const stats = performance.get(person.id);
    return {
      id: person.id,
      name: nameFor(person),
      position: locale === "th" ? person.positionTh : person.positionEn,
      photoUrl: person.photoUrl,
      isActive: person.isActive,
      hasAccount: Boolean(person.staffAccount),
      // The languages their *profile* is written in. There is no
      // "languages spoken" field on SalesPerson, and inventing one from a
      // bio would be a guess; this is the fact the database actually has.
      languages: LOCALE_DISPLAY_ORDER.filter((code) =>
        person.translations.some((row: any) => row.locale === code && (row.name ?? "").trim()),
      ),
      openLeads: stats?.openLeads ?? 0,
      responseLabel: durationLabel(stats?.avgResponseMs ?? null),
      responseIsSlow: (stats?.avgResponseMs ?? 0) > SLOW_RESPONSE_MS,
      viewings30d: stats?.viewings30d ?? 0,
      closed90d: stats?.closed90d ?? 0,
    };
  });

  const performanceRows = team
    .filter((person: any) => person.staffAccount)
    .map((person: any) => {
      const stats = performance.get(person.id);
      return {
        id: person.id,
        name: nameFor(person),
        projects: stats?.projectNames ?? [],
        leadsReceived: stats?.leadsReceived ?? 0,
        fastResponseRate: stats?.fastResponseRate ?? null,
        viewings: stats?.viewings30d ?? 0,
        closed: stats?.closed90d ?? 0,
        conversionRate: stats?.conversionRate ?? null,
      };
    });

  /*
    The one sentence worth putting under the table.

    Only when somebody is clearly behind the others rather than merely
    last: a note that fires every time a team has a slowest member says
    nothing. "Clearly" is a rate under the threshold *and* well below the
    best performer, on a sample big enough to mean something.
  */
  const rated = performanceRows.filter(
    (row): row is typeof row & { fastResponseRate: number } =>
      row.fastResponseRate !== null && row.leadsReceived >= 5,
  );
  const slowest = [...rated].sort((a, b) => a.fastResponseRate - b.fastResponseRate)[0];
  const best = [...rated].sort((a, b) => b.fastResponseRate - a.fastResponseRate)[0];

  const performanceHint =
    slowest &&
    best &&
    slowest.id !== best.id &&
    slowest.fastResponseRate < SLOW_RESPONSE_RATE_THRESHOLD &&
    best.fastResponseRate - slowest.fastResponseRate >= 20
      ? t("salesTeam.performance.slowHint", {
          name: slowest.name,
          project: slowest.projects[0] ?? t("salesTeam.performance.noProjects"),
          suggested: best.name,
        })
      : null;

  const routingMembers = team
    .filter((person: any) => person.staffAccount)
    .map((person: any) => ({ userId: person.staffAccount.id as string, name: nameFor(person) }));

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("salesTeam.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("salesTeam.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <SalesTeamCards
        locale={locale}
        members={cards}
        addHref="#add-member"
        labels={{
          openLeads: t("salesTeam.stats.openLeads"),
          avgResponse: t("salesTeam.stats.avgResponse"),
          viewings30d: t("salesTeam.stats.viewings30d"),
          closed90d: t("salesTeam.stats.closed90d"),
          showOnSite: t("salesTeam.showOnSite"),
          noAccount: t("salesTeam.noAccount"),
          noResponses: t("salesTeam.noResponses"),
          addTitle: t("salesTeam.addTitle"),
          addBody: t("salesTeam.addBody"),
          error: t("common.error"),
        }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesTeamPerformance
            rows={performanceRows}
            hint={performanceHint}
            slowThreshold={SLOW_RESPONSE_RATE_THRESHOLD}
            labels={{
              title: t("salesTeam.performance.title", { days: PERFORMANCE_WINDOW_DAYS }),
              sourceNote: t("salesTeam.performance.sourceNote"),
              member: t("salesTeam.performance.member"),
              projects: t("salesTeam.performance.projects"),
              leadsReceived: t("salesTeam.performance.leadsReceived"),
              fastResponse: t("salesTeam.performance.fastResponse"),
              viewings: t("salesTeam.performance.viewings"),
              closed: t("salesTeam.performance.closed"),
              conversion: t("salesTeam.performance.conversion"),
              noProjects: t("salesTeam.performance.noProjects"),
              noData: t("salesTeam.performance.noData"),
              empty: t("salesTeam.performance.empty"),
            }}
          />
        </div>

        <LeadRoutingPanel
          locale={locale}
          canEdit={hasRole(session.role, Role.ADMIN)}
          members={routingMembers}
          languages={LOCALE_DISPLAY_ORDER.map((code) => ({
            code,
            label: t(`salesTeam.routing.language.${code}` as never),
          }))}
          rules={routingRules}
          labels={{
            title: t("salesTeam.routing.title"),
            enabled: t("salesTeam.routing.enabled"),
            languageRule: t("salesTeam.routing.languageRule", { language: "{language}" }),
            noPreference: t("salesTeam.routing.noPreference"),
            perPersonCap: t("salesTeam.routing.perPersonCap"),
            capUnit: t("salesTeam.routing.capUnit"),
            escalate: t("salesTeam.routing.escalate"),
            escalateValue: t("salesTeam.routing.escalateValue", { hours: "{hours}", name: "{name}" }),
            escalateNote: t("salesTeam.routing.escalateNote"),
            teamLead: t("salesTeam.routing.teamLead"),
            edit: t("salesTeam.routing.edit"),
            cancel: t("common.cancel"),
            save: t("common.save"),
            auditNote: t("salesTeam.routing.auditNote"),
            disabledNote: t("salesTeam.routing.disabledNote"),
            readOnlyNote: t("salesTeam.routing.readOnlyNote"),
            error: t("common.error"),
            none: t("salesTeam.routing.none"),
          }}
        />
      </div>

      {/* One language selection drives every person's form on this page —
          see the file comment on LanguageTabs. */}
      <LanguageTabs
        active={lang}
        completeness={{ en: true, th: true, zh: true, ru: true }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      {/* ── Add ─────────────────────────────────────────────────────── */}
      {canEditRoster && (
      <section id="add-member" className="admin-card scroll-mt-6">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("salesTeam.newTitle")}
        </h2>

        <SalesPersonForm
          key={lang}
          lang={lang}
          action={createSalesPerson.bind(null, locale)}
          submitLabel={t("common.create")}
        />
      </section>
      )}

      {/* ── Existing ────────────────────────────────────────────────── */}
      {team.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("salesTeam.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {team.map((person: any) => {
            const completeness = translationCompleteness<any>(person.translations, "name");
            const editing = pickEditingTranslation<any>(person.translations, lang);

            return (
              <section key={person.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-primary">{person.nameEn}</h2>
                    <TranslationStatusBadges completeness={completeness} />
                  </div>

                  <span
                    className={
                      person.isActive
                        ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {person.isActive ? t("salesTeam.active") : t("salesTeam.inactive")}
                  </span>
                </div>

                {canEditRoster ? (
                  <SalesPersonForm
                    key={lang}
                    lang={lang}
                    action={updateSalesPerson.bind(null, locale, person.id)}
                    onDelete={deleteSalesPerson.bind(null, locale, person.id)}
                    values={{
                      name: editing?.name ?? "",
                      position: editing?.position ?? "",
                      whatsappNumber: person.whatsappNumber,
                      phoneNumber: person.phoneNumber,
                      email: person.email ?? "",
                      photoUrl: person.photoUrl ?? "",
                      isActive: person.isActive,
                      sortOrder: String(person.sortOrder),
                    }}
                    submitLabel={t("common.save")}
                  />
                ) : (
                  /* What a rep opened this page for, without a form they
                     cannot submit. Same fields, read-only — the actions
                     would refuse a save from this role anyway, and showing
                     the inputs would only make that a surprise. */
                  <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                    {[
                      [t("salesTeam.position"), editing?.position ?? ""],
                      [t("salesTeam.phone"), person.phoneNumber],
                      [t("salesTeam.whatsapp"), person.whatsappNumber],
                      [t("salesTeam.email"), person.email ?? ""],
                    ]
                      .filter(([, value]) => Boolean(value))
                      .map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs uppercase tracking-[0.1em] text-ink-muted">
                            {label}
                          </dt>
                          <dd className="mt-0.5 text-ink">{value}</dd>
                        </div>
                      ))}
                  </dl>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
