/**
 * app/[locale]/admin/(club)/partners/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * สิทธิพิเศษ & พาร์ทเนอร์ (the mockup's VIEWS.member): KPIs, the partner
 * table (?pj= filters by project), the partner drawer (?edit=<id>|new) and
 * the per-house approvals tab (?tab=approvals). The "บัตรลูกบ้าน" tab of the
 * mockup is not built — the card's printed privileges are static copy.
 *
 * Every CRM role can open it; partner master data is SUPER_ADMIN/ADMIN,
 * approving per-house changes is SUPER_ADMIN (lib/club/admin-partners.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CalendarClock, Clock, Gift, Plus, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { zoneEyebrow } from "@/lib/admin/nav";
import { partnerValidity } from "@/lib/club/benefits";
import { EXPIRY_WARNING_DAYS } from "@/lib/club/constants";
import {
  approvalsData,
  canApprove,
  canEditPartners,
  clubProjects,
  partnersForAdmin,
  pendingApprovalCount,
  requireClubAdmin,
  translationMissing,
  unitLabel,
} from "@/lib/club/admin-partners";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminTabs from "@/components/admin/ui/AdminTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import Segmented from "@/components/admin/ui/Segmented";
import KpiCard from "@/components/admin/KpiCard";
import PartnerTable, { type PartnerRow, type TableProject } from "@/components/admin/club/partners/PartnerTable";
import PartnerForm, { type PartnerFormValues } from "@/components/admin/club/partners/PartnerForm";
import ApprovalsTab, { type ApprovalItem } from "@/components/admin/club/partners/ApprovalsTab";
import type { ApprovalRow } from "@/lib/club/admin-partners";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; pj?: string; edit?: string }>;
};

const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

export default async function ClubPartnersPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await requireClubAdmin(locale);
  const canEdit = canEditPartners(session.role);

  const [t, tAdmin] = await Promise.all([
    getTranslations({ locale, namespace: "clubPartners" }),
    getTranslations({ locale, namespace: "admin" }),
  ]);

  const tab = searchParams.tab === "approvals" ? "approvals" : "partners";
  const [projectsRaw, partners, pendingCount, residentsByProject] = await Promise.all([
    clubProjects(),
    partnersForAdmin(),
    pendingApprovalCount(),
    prisma.projectUnit.groupBy({ by: ["projectId"], where: { status: "TRANSFERRED" }, _count: { _all: true } }),
  ]);
  const residentCount = new Map(residentsByProject.map((row) => [row.projectId, row._count._all]));
  const projects: TableProject[] = projectsRaw.map((project) => ({
    id: project.id,
    code: (project.cardCode ?? "").toUpperCase(),
    name: (locale === "th" ? project.nameTh : project.nameEn) || project.nameEn,
    residents: residentCount.get(project.id) ?? 0,
  }));

  const filter = projects.some((project) => project.id === searchParams.pj) ? (searchParams.pj as string) : "all";
  const base = `/${locale}/admin/partners`;
  const query = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { tab: tab === "approvals" ? "approvals" : undefined, pj: filter === "all" ? undefined : filter, ...extra };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const text = params.toString();
    return text ? `${base}?${text}` : base;
  };

  // ── KPIs ────────────────────────────────────────────────────────────
  const now = new Date();
  const rows: PartnerRow[] = partners.map((partner) => {
    const v = partnerValidity(partner.validFrom, partner.validTo, now);
    return {
      id: partner.id,
      name: partner.name,
      category: partner.category,
      area: partner.area,
      coverImage: partner.coverImage,
      discountPct: partner.discountPct,
      discountNote: partner.discountNote,
      phones: partner.phones,
      emails: partner.emails,
      website: partner.website,
      contactName: partner.contactName,
      isActive: partner.isActive,
      projectIds: partner.projects.map((link) => link.projectId),
      overrideCount: partner.overrideCount,
      trMissing: translationMissing(partner),
      validity: {
        state: v.state,
        date:
          v.state === "upcoming" ? v.from.toISOString() : v.state === "open" ? null : v.to ? v.to.toISOString() : null,
        days: v.state === "soon" ? v.daysLeft : null,
      },
    };
  });
  const on = rows.filter((row) => row.isActive);
  const categories = new Set(on.map((row) => row.category)).size;

  // ── Drawer ──────────────────────────────────────────────────────────
  const closeHref = query({});
  let formValues: PartnerFormValues | null = null;
  if (canEdit && searchParams.edit) {
    if (searchParams.edit === "new") {
      formValues = {
        id: null,
        name: "",
        category: "dine",
        area: "",
        pct: "",
        note: "",
        noteEn: "",
        noteZh: "",
        noteRu: "",
        validFrom: "",
        validTo: "",
        phones: "",
        contactName: "",
        emails: "",
        website: "",
        coverImage: "",
        isActive: true,
        projectIds: projects.map((project) => project.id),
      };
    } else {
      const partner = partners.find((row) => row.id === searchParams.edit);
      if (partner) {
        const note = (code: string) => partner.translations.find((row) => row.locale === code)?.discountNote ?? "";
        formValues = {
          id: partner.id,
          name: partner.name,
          category: partner.category,
          area: partner.area ?? "",
          pct: partner.discountPct ? String(partner.discountPct) : "",
          note: partner.discountNote ?? "",
          noteEn: note("en"),
          noteZh: note("zh"),
          noteRu: note("ru"),
          validFrom: isoDay(partner.validFrom),
          validTo: isoDay(partner.validTo),
          phones: partner.phones.join("\n"),
          contactName: partner.contactName ?? "",
          emails: partner.emails.join("\n"),
          website: partner.website ?? "",
          coverImage: partner.coverImage ?? "",
          isActive: partner.isActive,
          projectIds: partner.projects.map((link) => link.projectId),
        };
      }
    }
  }

  // ── Approvals ───────────────────────────────────────────────────────
  let approvals: { pending: ApprovalItem[]; history: ApprovalItem[] } | null = null;
  if (tab === "approvals") {
    const data = await approvalsData();
    const map = (row: ApprovalRow): ApprovalItem => ({
      id: row.id,
      // A pending request shows its latest edit; a decided one when it was asked.
      createdAt: (row.status === "PENDING" ? row.updatedAt : row.createdAt).toISOString(),
      unitId: row.unit.id,
      house: unitLabel(row.unit),
      owner: row.unit.resident?.ownerName ?? null,
      partnerName: row.partner.name,
      defaultPct: row.partner.discountPct,
      from: { hidden: row.fromHidden, pct: row.fromPct },
      to: { hidden: row.toHidden, pct: row.toPct },
      requestedById: row.requestedById,
      requestedByName: row.requestedByName,
      status: row.status,
      decidedById: row.decidedById,
      decidedByName: row.decidedByName,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      reason: row.reason,
    });
    approvals = { pending: data.pending.map(map), history: data.history.map(map) };
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => tAdmin(key as never), "clubPartners")}
        title={t("title")}
        description={t("subtitle")}
        actions={
          canEdit && tab === "partners" ? (
            <Link href={query({ edit: "new" })} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("add")}
            </Link>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          href={null}
          icon={Store}
          tone="info"
          label={t("kpi.partners")}
          value={String(on.length)}
          hint={t("kpi.partnersHint", { cats: categories, hidden: rows.length - on.length })}
        />
        <KpiCard
          href={null}
          icon={Gift}
          tone="success"
          label={t("kpi.withBenefit")}
          value={String(on.filter((row) => row.discountPct).length)}
          hint={t("kpi.withBenefitHint")}
        />
        <KpiCard
          href={null}
          icon={Clock}
          tone="content"
          label={t("kpi.comingSoon")}
          value={String(on.filter((row) => !row.discountPct).length)}
          hint={t("kpi.comingSoonHint")}
        />
        <KpiCard
          href={null}
          icon={CalendarClock}
          tone="ocean"
          label={t("kpi.expiring")}
          value={String(on.filter((row) => row.validity.state === "soon").length)}
          hint={t("kpi.expiringHint", {
            days: EXPIRY_WARNING_DAYS,
            expired: on.filter((row) => row.validity.state === "expired").length,
          })}
        />
      </div>

      <AdminTabs
        label={t("tabs.label")}
        tabs={[
          { key: "partners", href: query({ tab: undefined }), label: t("tabs.partners"), active: tab === "partners", count: on.length },
          { key: "approvals", href: query({ tab: "approvals" }), label: t("tabs.approvals"), active: tab === "approvals", badge: pendingCount },
        ]}
      />

      {tab === "approvals" && approvals ? (
        <ApprovalsTab
          locale={locale}
          pending={approvals.pending}
          history={approvals.history}
          userId={session.id}
          canApprove={canApprove(session.role)}
          houseHref={`/${locale}/admin/residents?unit=`}
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Segmented
              label={t("filter.label")}
              active={filter}
              items={[
                { key: "all", label: t("filter.all"), count: on.length, href: query({ pj: undefined }) },
                ...projects.map((project) => ({
                  key: project.id,
                  label: project.code,
                  count: on.filter((row) => row.projectIds.includes(project.id)).length,
                  href: query({ pj: project.id }),
                })),
              ]}
            />
            <span className="text-xs text-adm-muted">
              {filter === "all"
                ? t("filter.orderHint")
                : t("filter.projectHint", {
                    project: projects.find((project) => project.id === filter)?.code ?? "",
                    count: on.filter((row) => row.projectIds.includes(filter)).length,
                  })}
            </span>
            {!canEdit && (
              <span className="ml-auto rounded-full border border-adm-line px-2.5 py-1 text-[11.5px] text-adm-muted">
                {t("readOnly")}
              </span>
            )}
          </div>
          <PartnerTable
            locale={locale}
            rows={rows}
            projects={projects}
            filter={filter}
            canEdit={canEdit}
            editHref={`${query({})}${query({}).includes("?") ? "&" : "?"}edit=`}
          />
        </>
      )}

      {formValues && (
        <AdminDrawer
          title={formValues.id ? t("form.titleEdit") : t("form.titleNew")}
          icon={formValues.id ? <Store size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
          closeHref={closeHref}
          closeLabel={t("form.close")}
          width={600}
        >
          <PartnerForm
            key={formValues.id ?? "new"}
            locale={locale}
            values={formValues}
            projects={projects}
            closeHref={closeHref}
            canDelete={canEdit}
          />
        </AdminDrawer>
      )}
    </div>
  );
}
