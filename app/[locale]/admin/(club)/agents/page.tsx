/**
 * app/[locale]/admin/(club)/agents/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * เอเจนซี่ / Co-agent (the mockup's VIEWS.agency). Filters are URL
 * parameters (?q= search, ?ch= channel chip), the agent drawer is ?edit=
 * <id>|new and the registration-links drawer is ?links=1 — the same
 * URL-driven drawers as the rest of the admin.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AlertTriangle, Briefcase, Clock, Link2, Plus, ShieldAlert, UserRound, Users } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/role-rank";
import { zoneEyebrow } from "@/lib/admin/nav";
import { maskPhone } from "@/lib/contact-mask";
import { requireClubAdmin } from "@/lib/club/admin-guard";
import {
  agentsForAdmin,
  duplicateMap,
  ensureRefSlugs,
  phoneKey,
  registrationUrl,
  salesPeopleForAgents,
  type AdminAgent,
} from "@/lib/club/admin-agents";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import KpiCard from "@/components/admin/KpiCard";
import AgentTable, { type AgentRowData } from "@/components/admin/club/agents/AgentTable";
import AgentForm, { type AgentFormValues } from "@/components/admin/club/agents/AgentForm";
import AgentExportButton from "@/components/admin/club/agents/AgentExportButton";
import RegLinks, { type RegLink } from "@/components/admin/club/agents/RegLinks";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; ch?: string; edit?: string; links?: string }>;
};

export default async function ClubAgentsPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await requireClubAdmin(locale);
  const canAdmin = hasRole(session.role, Role.ADMIN);

  const [t, tAdmin] = await Promise.all([
    getTranslations({ locale, namespace: "clubAgents.agents" }),
    getTranslations({ locale, namespace: "admin" }),
  ]);

  // Links need a slug per active sales person; created lazily, once.
  if (searchParams.links) await ensureRefSlugs();
  const [agents, salesPeople] = await Promise.all([agentsForAdmin(), salesPeopleForAgents()]);
  const salesById = new Map(salesPeople.map((person) => [person.id, person]));

  const channelOf = (agent: AdminAgent): string | null =>
    agent.salesPersonId ? (salesById.get(agent.salesPersonId)?.nick ?? null) : agent.selfRegistered ? t("channelWebsite") : null;
  const channelKey = (agent: AdminAgent) => agent.salesPersonId ?? (agent.selfRegistered ? "website" : "none");

  // ── Filters ─────────────────────────────────────────────────────────
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const ch = searchParams.ch ?? "all";
  const qDigits = phoneKey(q);
  const filtered = agents.filter((agent) => {
    if (q) {
      const hay = [agent.name, agent.company, agent.email].filter(Boolean).join(" ").toLowerCase();
      const phoneHit = qDigits && [agent.phone, agent.whatsapp].some((p) => phoneKey(p).includes(qDigits));
      if (!hay.includes(q) && !phoneHit) return false;
    }
    if (ch === "all") return true;
    if (ch === "pending") return agent.status === "PENDING";
    if (ch === "nocons") return !agent.noticeVersion;
    return channelKey(agent) === ch;
  });

  const base = `/${locale}/admin/agents`;
  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q: searchParams.q || undefined, ch: ch === "all" ? undefined : ch, ...extra };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const text = params.toString();
    return text ? `${base}?${text}` : base;
  };
  const closeHref = href({});
  const editBase = `${closeHref}${closeHref.includes("?") ? "&" : "?"}edit=`;

  // ── KPIs ────────────────────────────────────────────────────────────
  const approved = agents.filter((agent) => agent.status === "APPROVED");
  const pending = agents.filter((agent) => agent.status === "PENDING");
  const companies = new Set(approved.map((agent) => (agent.company ?? "").trim().toLowerCase()).filter(Boolean)).size;
  const viaSales = salesPeople
    .map((person) => ({ person, count: approved.filter((agent) => agent.salesPersonId === person.id).length }))
    .filter((row) => row.count > 0);
  const noNotice = agents.filter((agent) => !agent.noticeVersion).length;

  const dups = duplicateMap(agents);
  const rows: AgentRowData[] = filtered.map((agent) => ({
    id: agent.id,
    name: agent.name,
    company: agent.company,
    phoneMasked: agent.phone ? maskPhone(agent.phone) : "",
    whatsappMasked: agent.whatsapp ? maskPhone(agent.whatsapp) : null,
    email: agent.email,
    channel: channelOf(agent),
    pending: agent.status === "PENDING",
    leads: agent._count.leads,
    duplicates: dups.get(agent.id) ?? [],
    hasNotice: Boolean(agent.noticeVersion),
  }));

  const chips: { key: string; label: string; count: number }[] = [
    { key: "all", label: t("chipAll"), count: agents.length },
    ...salesPeople
      .filter((person) => agents.some((agent) => agent.salesPersonId === person.id))
      .map((person) => ({ key: person.id, label: person.nick, count: agents.filter((agent) => agent.salesPersonId === person.id).length })),
    { key: "website", label: t("chipWebsite"), count: agents.filter((agent) => channelKey(agent) === "website").length },
    { key: "none", label: t("chipNone"), count: agents.filter((agent) => channelKey(agent) === "none").length },
    { key: "nocons", label: t("chipNoConsent"), count: noNotice },
    ...(pending.length ? [{ key: "pending", label: t("chipPending"), count: pending.length }] : []),
  ];

  // ── Agent drawer ────────────────────────────────────────────────────
  let formValues: AgentFormValues | null = null;
  if (searchParams.edit === "new") {
    formValues = {
      id: null,
      name: "",
      company: "",
      phone: "",
      whatsapp: "",
      email: "",
      salesPersonId: "",
      pending: false,
      selfRegistered: false,
      channelLabel: "",
      consent: null,
      leads: [],
    };
  } else if (searchParams.edit) {
    const agent = agents.find((row) => row.id === searchParams.edit);
    if (agent) {
      const leads = await prisma.leadInquiry.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, name: true, status: true, project: { select: { nameEn: true, nameTh: true } } },
      });
      formValues = {
        id: agent.id,
        name: agent.name,
        company: agent.company ?? "",
        phone: agent.phone,
        whatsapp: agent.whatsapp ?? "",
        email: agent.email ?? "",
        salesPersonId: agent.salesPersonId ?? "",
        pending: agent.status === "PENDING",
        selfRegistered: agent.selfRegistered,
        channelLabel: channelOf(agent) ?? t("channelWebsite"),
        consent:
          agent.noticeVersion && agent.noticeAt
            ? { version: agent.noticeVersion, at: agent.noticeAt.toISOString(), locale: agent.formLocale ?? "", news: agent.newsConsent }
            : null,
        leads: leads.map((lead) => ({
          id: lead.id,
          name: lead.name,
          status: lead.status,
          project: lead.project ? (locale === "th" ? lead.project.nameTh : lead.project.nameEn) || lead.project.nameEn : null,
        })),
      };
    }
  }
  const editingAgent = formValues?.id ? agents.find((row) => row.id === formValues.id) : null;

  // ── Links drawer ────────────────────────────────────────────────────
  const linkLocale = locale;
  const salesLinks: RegLink[] = salesPeople
    .filter((person) => person.isActive && person.refSlug)
    .map((person) => ({
      key: person.id,
      salesPersonId: person.id,
      title: `${person.nick} · ${(locale === "th" ? person.nameTh : person.nameEn) || person.nameEn}`,
      subtitle: (locale === "th" ? person.positionTh : person.positionEn) || person.positionEn || null,
      url: registrationUrl(linkLocale, person.refSlug),
      enabled: person.agentLinkEnabled,
      registered: agents.filter((agent) => agent.selfRegistered && agent.salesPersonId === person.id).length,
    }));
  const websiteLink: RegLink = {
    key: "web",
    salesPersonId: null,
    title: t("linksWebsite"),
    subtitle: null,
    url: registrationUrl(linkLocale, null),
    enabled: true,
    registered: agents.filter((agent) => agent.selfRegistered && !agent.salesPersonId).length,
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => tAdmin(key as never), "clubAgents")}
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <AgentExportButton locale={locale} />
            <Link href={href({ links: "1" })} scroll={false} className="admin-btn-ghost">
              <Link2 size={15} aria-hidden /> {t("links")}
            </Link>
            <Link href={href({ edit: "new" })} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden /> {t("add")}
            </Link>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard href={null} icon={Users} tone="info" label={t("kpiTotal")} value={String(approved.length)} hint={t("kpiTotalHint", { count: companies })} />
        {viaSales.slice(0, 2).map(({ person, count }) => (
          <KpiCard
            key={person.id}
            href={href({ ch: person.id })}
            icon={Briefcase}
            tone="ocean"
            label={t("kpiVia", { name: person.nick })}
            value={String(count)}
            hint={t("kpiViaHint")}
          />
        ))}
        <KpiCard href={href({ ch: "pending" })} icon={Clock} tone="content" label={t("kpiPending")} value={String(pending.length)} hint={t("kpiPendingHint")} />
        <KpiCard href={href({ ch: "nocons" })} icon={ShieldAlert} tone="success" label={t("kpiNoConsent")} value={String(noNotice)} hint={t("kpiNoConsentHint")} />
      </div>

      {pending.length > 0 && (
        <div className="mb-3 flex items-center gap-2.5 rounded-[10px] bg-adm-warning-bg px-3 py-2.5 text-[13px] text-adm-warning">
          <AlertTriangle size={15} aria-hidden />
          <span>
            {t("pendingNote", { count: pending.length })}{" "}
            <Link href={href({ ch: "pending" })} className="font-medium underline">
              {t("viewPending")}
            </Link>
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <form action={base} className="flex items-center gap-1.5">
          {ch !== "all" && <input type="hidden" name="ch" value={ch} />}
          <input name="q" defaultValue={searchParams.q ?? ""} placeholder={t("search")} aria-label={t("search")} className="admin-input w-72" />
          <button type="submit" className="admin-btn-ghost admin-btn-sm">
            {t("searchButton")}
          </button>
        </form>
        <nav aria-label={t("chipsLabel")} className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={href({ ch: chip.key === "all" ? undefined : chip.key })}
              scroll={false}
              aria-current={ch === chip.key ? "page" : undefined}
              className={[
                "inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border px-[11px] text-[12.5px] transition-colors",
                ch === chip.key
                  ? "border-adm-fill/50 bg-adm-fill/14 text-adm-text"
                  : "border-adm-line-strong text-adm-muted hover:text-adm-text",
              ].join(" ")}
            >
              {chip.label} <b className="font-semibold tabular-nums">{chip.count}</b>
            </Link>
          ))}
        </nav>
      </div>

      <AgentTable locale={locale} rows={rows} editHref={editBase} />

      {formValues && (
        <AdminDrawer
          title={formValues.id ? formValues.name : t("drawerNew")}
          icon={formValues.id ? <UserRound size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
          closeHref={closeHref}
          closeLabel={t("close")}
          width={560}
        >
          {editingAgent && <p className="-mt-2 mb-4 text-sm text-adm-muted">{editingAgent.company || t("noCompany")}</p>}
          {!formValues.id && <p className="-mt-2 mb-4 text-sm text-adm-muted">{t("drawerNewSub")}</p>}
          <AgentForm
            key={formValues.id ?? "new"}
            locale={locale}
            values={formValues}
            salesPeople={salesPeople
              .filter((person) => person.isActive || person.id === formValues.salesPersonId)
              .map((person) => ({ id: person.id, label: `${person.nick} · ${(locale === "th" ? person.nameTh : person.nameEn) || person.nameEn}` }))}
            companies={[...new Set(agents.map((agent) => agent.company).filter((c): c is string => Boolean(c)))]}
            closeHref={closeHref}
            canErase={canAdmin}
          />
        </AdminDrawer>
      )}

      {searchParams.links && !formValues && (
        <AdminDrawer title={t("linksTitle")} icon={<Link2 size={18} aria-hidden />} closeHref={closeHref} closeLabel={t("close")} width={560}>
          <p className="-mt-2 mb-4 text-sm text-adm-muted">{t("linksSub")}</p>
          <RegLinks locale={locale} sales={salesLinks} website={websiteLink} canToggle={canAdmin} />
        </AdminDrawer>
      )}
    </div>
  );
}
