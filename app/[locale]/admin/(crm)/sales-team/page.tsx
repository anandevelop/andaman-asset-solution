/**
 * app/[locale]/admin/sales-team/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sales team: add at the top, every existing person editable in place —
 * same arrangement as /admin/pages/faq. Reordering is the sortOrder field on
 * each form, not drag-and-drop, matching every other list in this admin
 * (progress months, FAQs).
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, UserPlus, UsersRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import {
  getSalesPerformance,
  PERFORMANCE_WINDOW_DAYS,
} from "@/lib/admin/sales-performance";

/** Below this percentage answered inside the fast window, the table draws
 *  the bar red and the note below it may fire. */
const SLOW_RESPONSE_RATE_THRESHOLD = 60;
import { getRoutingRules, roleCanHoldLeads } from "@/lib/lead-routing";
import { hasRole } from "@/lib/role-rank";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import { Role } from "@prisma/client";
import SalesTeamCards, { type TeamCardMember } from "@/components/admin/SalesTeamCards";
import SalesTeamPerformance from "@/components/admin/SalesTeamPerformance";
import LeadRoutingPanel from "@/components/admin/LeadRoutingPanel";
import { createSalesPerson, deleteSalesPerson, updateSalesPerson } from "./actions";
import SalesPersonForm from "@/components/admin/SalesPersonForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import AdminImage from "@/components/admin/ui/AdminImage";
import Avatar from "@/components/admin/ui/Avatar";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; edit?: string }> };

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
        include: {
          translations: true,
          // role and isActive are here so the card can say whether the
          // linked account is one the lead router would actually pick —
          // see LEAD_CANDIDATE_WHERE.
          staffAccount: { select: { id: true, name: true, role: true, isActive: true } },
        },
      }),
    [] as any[],
  );

  const base = `/${locale}/admin/sales-team`;
  /* The drawer: "new" for the add form (editors only), or the person
     whose card was clicked. Anything else — a deleted id, a SALES user
     guessing ?edit=new — simply opens nothing. */
  const editing: "new" | any | null =
    searchParams.edit === "new"
      ? canEditRoster
        ? "new"
        : null
      : canEditRoster
        ? (team.find((person: any) => person.id === searchParams.edit) ?? null)
        : null;

  // ── Dashboard data ────────────────────────────────────────────────────
  const [performance, routingRules] = await Promise.all([
    getSalesPerformance(
      locale,
      team.map((person: any) => ({ id: person.id, userId: person.staffAccount?.id ?? null })),
    ),
    getRoutingRules(),
  ]);

  // A missing Thai name falls back to English rather than a blank card;
  // the "ขาดชื่อไทย" pill on the card says it is missing.
  const nameFor = (person: any) =>
    (locale === "th" ? person.nameTh : person.nameEn) || person.nameEn || person.nameTh;

  const cards: TeamCardMember[] = team.map((person: any) => {
    return {
      id: person.id,
      name: nameFor(person),
      position: (locale === "th" ? person.positionTh : person.positionEn) || person.positionEn || "",
      photoUrl: person.photoUrl,
      isActive: person.isActive,
      hasAccount: Boolean(person.staffAccount),
      /*
        Only the role, which is what the warning tells them to change. A
        disabled account is a separate and more obvious condition — that
        person cannot sign in at all — and answering it with "raise the
        role" would send someone to the wrong switch.
      */
      accountCannotTakeLeads: Boolean(
        person.staffAccount && !roleCanHoldLeads(person.staffAccount.role),
      ),
      // The languages their *profile* is written in. There is no
      // "languages spoken" field on SalesPerson, and inventing one from a
      // bio would be a guess; this is the fact the database actually has.
      languages: LOCALE_DISPLAY_ORDER.filter((code) =>
        person.translations.some((row: any) => row.locale === code && (row.name ?? "").trim()),
      ),
      missingThai: !person.translations.some((row: any) => row.locale === "th" && (row.name ?? "").trim()),
      phone: person.phoneNumber,
      whatsapp: person.whatsappNumber,
      email: person.email ?? null,
    };
  });

  /* Open leads per rep — the "ภาระงานลีดต่อคน" card. Only people with an
     account: a profile without one cannot be given a lead, so a zero for
     it would read as an idle rep rather than an unlinked profile. */
  const workload = team
    .filter((person: any) => person.staffAccount)
    .map((person: any) => ({
      id: person.id,
      name: nameFor(person),
      photoUrl: person.photoUrl as string | null,
      openLeads: performance.get(person.id)?.openLeads ?? 0,
    }));
  const workloadMax = Math.max(1, ...workload.map((row: { openLeads: number }) => row.openLeads));
  const unlinkedCount = team.filter((person: any) => !person.staffAccount).length;

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

  /*
    Only accounts the router would actually pick. Offering one it skips lets
    an admin point a language at somebody and watch nothing ever arrive —
    decideAssignee drops an ineligible preference and falls through to the
    lightest workload, silently.
  */
  const routingMembers = team
    .filter((person: any) => person.staffAccount && roleCanHoldLeads(person.staffAccount.role))
    .map((person: any) => ({ userId: person.staffAccount.id as string, name: nameFor(person) }));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "salesTeam")}
        title={t("salesTeam.title")}
        description={t("salesTeam.subtitle")}
        actions={
          canEditRoster ? (
            <Link href={`${base}?edit=new`} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("salesTeam.addButton")}
            </Link>
          ) : undefined
        }
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <SalesTeamCards
        locale={locale}
        members={cards}
        editHrefBase={canEditRoster ? `${base}?edit=` : null}
        labels={{
          showOnSite: t("salesTeam.showOnSite"),
          onSite: t("salesTeam.onSite"),
          missingThai: t("salesTeam.missingThai"),
          noAccount: t("salesTeam.noAccountShort"),
          accountCannotTakeLeads: t("salesTeam.cannotTakeLeadsShort"),
          edit: t("common.edit"),
          message: t("salesTeam.message"),
          error: t("common.error"),
        }}
      />

      {/* ── Lead load per rep ──────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-adm-text">
          <UsersRound size={16} aria-hidden className="text-adm-accent-ink" />
          {t("salesTeam.workload.title")}
        </h2>
        {workload.length === 0 ? (
          <p className="mt-3 text-sm text-adm-muted">{t("salesTeam.workload.empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workload.map((row: { id: string; name: string; photoUrl: string | null; openLeads: number }) => (
              <li key={row.id} className="flex items-center gap-3">
                {row.photoUrl ? (
                  <AdminImage src={row.photoUrl} iconSize={10} className="h-[22px] w-[22px] shrink-0 rounded-full object-cover" />
                ) : (
                  <Avatar id={row.id} name={row.name} size="sm" />
                )}
                <span className="w-[200px] shrink-0 truncate text-sm text-adm-text">{row.name}</span>
                <span className="h-2 flex-1 rounded-full bg-adm-text/6">
                  <span
                    className="block h-full rounded-full bg-adm-status-info"
                    style={{ width: `${(row.openLeads / workloadMax) * 100}%` }}
                  />
                </span>
                <span className="admin-mono w-16 shrink-0 text-right text-xs text-adm-muted">
                  {t("salesTeam.workload.leads", { count: row.openLeads })}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* A profile is only a rep the router can use once a user account
            points at it (User.salesPersonId) — the usual reason somebody is
            missing from this card. */}
        {unlinkedCount > 0 && (
          <p className="mt-4 border-t border-adm-line pt-3 text-xs text-adm-muted">
            {t("salesTeam.workload.unlinked", { count: unlinkedCount })}
          </p>
        )}
      </section>

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

      {/* ── Add / edit drawer (?edit=new, ?edit=<id>) ───────────────────── */}
      {editing && (
        <AdminDrawer
          title={editing === "new" ? t("salesTeam.newTitle") : editing.nameEn}
          icon={editing === "new" ? <UserPlus size={18} aria-hidden /> : undefined}
          closeHref={base}
          closeLabel={t("leadDrawer.close")}
        >
          <div className="space-y-5">
            {/* The language picker drives the name and position fields;
                its links keep ?edit=, so switching keeps the drawer open. */}
            <LanguageTabs
              active={lang}
              completeness={
                editing === "new"
                  ? { en: true, th: true, zh: true, ru: true }
                  : translationCompleteness<any>(editing.translations, "name")
              }
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />

            {editing === "new" ? (
              <SalesPersonForm
                key={lang}
                lang={lang}
                action={createSalesPerson.bind(null, locale)}
                submitLabel={t("common.create")}
              />
            ) : canEditRoster ? (
              <SalesPersonForm
                key={`${editing.id}:${lang}`}
                lang={lang}
                action={updateSalesPerson.bind(null, locale, editing.id)}
                onDelete={deleteSalesPerson.bind(null, locale, editing.id)}
                values={{
                  name: pickEditingTranslation<any>(editing.translations, lang)?.name ?? "",
                  position: pickEditingTranslation<any>(editing.translations, lang)?.position ?? "",
                  whatsappNumber: editing.whatsappNumber,
                  phoneNumber: editing.phoneNumber,
                  email: editing.email ?? "",
                  photoUrl: editing.photoUrl ?? "",
                  isActive: editing.isActive,
                  sortOrder: String(editing.sortOrder),
                }}
                submitLabel={t("common.save")}
              />
            ) : null}
          </div>
        </AdminDrawer>
      )}
    </div>
  );
}
