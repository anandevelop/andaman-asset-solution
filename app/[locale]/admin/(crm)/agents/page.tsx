/**
 * app/[locale]/admin/(crm)/agents/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * เอเจนซี่ / Co-agent. Laid out to be read at a glance (2026-11 redesign,
 * project doc claude/coagent-admin-mockup.md): one summary strip, the
 * registrations waiting for approval as a card of their own, one row of
 * filters, and a five-column list that does not scroll sideways.
 *
 * Filters are URL parameters — ?q= search, ?f= what needs attention
 * (pending | nocons | dup), ?ch= registration channel — the agent drawer
 * is ?edit=<id>|new and the registration-links drawer is ?links=1, the
 * same URL-driven drawers as the rest of the admin.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Link2, Plus, Search, UserRound } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/role-rank";
import { zoneEyebrow } from "@/lib/admin/nav";
import { maskPhone } from "@/lib/contact-mask";
import { requireAgentsAdmin } from "@/lib/agents/guard";
import {
  agentsForAdmin,
  duplicateMap,
  ensureRefSlugs,
  phoneKey,
  registrationUrl,
  salesPeopleForAgents,
  type AdminAgent,
} from "@/lib/agents/admin";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import AgentTable, { type AgentRowData } from "@/components/admin/agents/AgentTable";
import AgentForm, { type AgentFormValues } from "@/components/admin/agents/AgentForm";
import AgentExportButton from "@/components/admin/agents/AgentExportButton";
import RegLinks, { type RegLink } from "@/components/admin/agents/RegLinks";
import PendingAgents from "@/components/admin/agents/PendingAgents";
import ChannelSelect from "@/components/admin/agents/ChannelSelect";
import { fmtDateTime } from "@/components/admin/agents/ui";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; f?: string; ch?: string; edit?: string; links?: string }>;
};

export default async function AgentsPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await requireAgentsAdmin(locale);
  const canAdmin = hasRole(session.role, Role.ADMIN);

  const [t, tAdmin] = await Promise.all([
    getTranslations({ locale, namespace: "coAgents.agents" }),
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
  const dups = duplicateMap(agents);
  const FLAGS = ["pending", "nocons", "dup"] as const;
  type Flag = (typeof FLAGS)[number] | "all";
  // ?ch=pending and ?ch=nocons were this page's own links before the
  // channel and the "needs attention" filters were split; still honoured.
  const legacyFlag = (FLAGS as readonly string[]).includes(searchParams.ch ?? "") ? (searchParams.ch as Flag) : null;
  const flag: Flag = (FLAGS as readonly string[]).includes(searchParams.f ?? "") ? (searchParams.f as Flag) : (legacyFlag ?? "all");
  const ch = legacyFlag ? "all" : (searchParams.ch ?? "all");

  const hasFlag = (agent: AdminAgent, key: Flag) =>
    key === "all" ||
    (key === "pending" && agent.status === "PENDING") ||
    (key === "nocons" && !agent.noticeVersion) ||
    (key === "dup" && (dups.get(agent.id)?.length ?? 0) > 0);

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const qDigits = phoneKey(q);
  const filtered = agents.filter((agent) => {
    if (q) {
      const hay = [agent.name, agent.company, agent.email].filter(Boolean).join(" ").toLowerCase();
      const phoneHit = qDigits && [agent.phone, agent.whatsapp].some((p) => phoneKey(p).includes(qDigits));
      if (!hay.includes(q) && !phoneHit) return false;
    }
    if (!hasFlag(agent, flag)) return false;
    return ch === "all" || channelKey(agent) === ch;
  });

  const base = `/${locale}/admin/agents`;
  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      q: searchParams.q || undefined,
      f: flag === "all" ? undefined : flag,
      ch: ch === "all" ? undefined : ch,
      ...extra,
    };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const text = params.toString();
    return text ? `${base}?${text}` : base;
  };
  const closeHref = href({});
  const editBase = `${closeHref}${closeHref.includes("?") ? "&" : "?"}edit=`;

  // ── Summary ─────────────────────────────────────────────────────────
  const approved = agents.filter((agent) => agent.status === "APPROVED");
  const pending = agents.filter((agent) => agent.status === "PENDING");
  const companies = new Set(approved.map((agent) => (agent.company ?? "").trim().toLowerCase()).filter(Boolean)).size;

  /* Where the approved agents registered: one segment per sales person
     who has any, then the website, then "not stated". The sales people
     take the navy-to-blue steps, so the two that are not a person read as
     different in kind and not only in shade. */
  const SALES_TONES = ["var(--adm-strong)", "var(--adm-ocean)", "var(--adm-ocean-hi)", "var(--adm-content)"];
  const channelBar = [
    ...salesPeople
      .map((person) => ({ key: person.id, label: person.nick, count: approved.filter((agent) => agent.salesPersonId === person.id).length }))
      .filter((row) => row.count > 0)
      .map((row, index) => ({ ...row, color: SALES_TONES[index % SALES_TONES.length] })),
    { key: "website", label: t("chipWebsite"), count: approved.filter((agent) => channelKey(agent) === "website").length, color: "var(--adm-fill)" },
    { key: "none", label: t("chipNone"), count: approved.filter((agent) => channelKey(agent) === "none").length, color: "var(--adm-line-strong)" },
  ].filter((row) => row.count > 0);

  const rows: AgentRowData[] = filtered.map((agent) => ({
    id: agent.id,
    name: agent.name,
    company: agent.company,
    phoneMasked: agent.phone ? maskPhone(agent.phone) : "",
    hasWhatsapp: Boolean(agent.whatsapp),
    email: agent.email,
    channel: channelOf(agent),
    pending: agent.status === "PENDING",
    leads: agent._count.leads,
    duplicates: dups.get(agent.id) ?? [],
    hasNotice: Boolean(agent.noticeVersion),
  }));

  const flagFilters: { key: Flag; label: string; count: number }[] = [
    { key: "all", label: t("chipAll"), count: agents.length },
    { key: "pending", label: t("chipPending"), count: pending.length },
    { key: "nocons", label: t("chipNoConsent"), count: agents.filter((agent) => hasFlag(agent, "nocons")).length },
    { key: "dup", label: t("duplicate"), count: agents.filter((agent) => hasFlag(agent, "dup")).length },
  ];

  const channelOptions = [
    { value: "all", label: t("channelAll"), href: href({ ch: undefined }) },
    ...salesPeople
      .filter((person) => agents.some((agent) => agent.salesPersonId === person.id))
      .map((person) => ({ value: person.id, label: person.nick, href: href({ ch: person.id }) })),
    { value: "website", label: t("chipWebsite"), href: href({ ch: "website" }) },
    { value: "none", label: t("chipNone"), href: href({ ch: "none" }) },
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
          status: tAdmin(`leadStatus.${lead.status}` as never),
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
        eyebrow={zoneEyebrow((key) => tAdmin(key as never), "coAgents")}
        title={t("title")}
        description={t("subtitleShort")}
        actions={
          <>
            {canAdmin && <AgentExportButton locale={locale} />}
            <Link href={href({ links: "1" })} scroll={false} className="admin-btn-ghost">
              <Link2 size={15} aria-hidden /> {t("links")}
            </Link>
            <Link href={href({ edit: "new" })} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden /> {t("add")}
            </Link>
          </>
        }
      />

      {/* One strip instead of four cards: how many, and where they came
          from. Each legend entry filters the list to that channel. */}
      <section aria-label={t("summaryLabel")} className="admin-card mb-5 flex flex-wrap items-center gap-x-10 gap-y-5">
        <p className="flex items-baseline gap-2.5">
          <span className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-adm-text tabular-nums">{approved.length}</span>
          <span className="text-sm text-adm-muted">{t("summaryAgents", { count: companies })}</span>
        </p>
        {channelBar.length > 0 && (
          <div className="min-w-0 flex-[1_1_22rem] space-y-2">
            <p className="text-xs text-adm-muted">{t("summaryChannels")}</p>
            <div className="flex h-2.5 gap-[3px]" role="img" aria-label={channelBar.map((row) => `${row.label} ${row.count}`).join(", ")}>
              {channelBar.map((row) => (
                <span key={row.key} className="rounded-full" style={{ flex: `${row.count} 1 0`, background: row.color }} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-[12.5px] text-adm-muted">
              {channelBar.map((row) => (
                <li key={row.key}>
                  <Link href={href({ ch: row.key, f: undefined })} scroll={false} className="inline-flex items-center gap-1.5 hover:text-adm-text">
                    <i aria-hidden className="size-2 rounded-[3px]" style={{ background: row.color }} />
                    {row.label} <b className="font-semibold text-adm-text tabular-nums">{row.count}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <PendingAgents
          locale={locale}
          agents={pending.map((agent) => ({
            id: agent.id,
            name: agent.name,
            meta: [agent.company || t("noCompany"), t("via", { channel: channelOf(agent) ?? t("channelWebsite") }), fmtDateTime(agent.createdAt, locale)].join(" · "),
            editHref: `${editBase}${agent.id}`,
          }))}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <form action={base} role="search" className="flex-[1_1_16rem] sm:max-w-[340px]">
          {flag !== "all" && <input type="hidden" name="f" value={flag} />}
          {ch !== "all" && <input type="hidden" name="ch" value={ch} />}
          <label className="flex min-h-[38px] items-center gap-2 rounded-[10px] border border-adm-line-strong bg-adm-panel px-3 text-adm-muted focus-within:border-adm-info">
            <Search size={15} aria-hidden className="shrink-0" />
            <input
              name="q"
              type="search"
              defaultValue={searchParams.q ?? ""}
              placeholder={t("search")}
              aria-label={t("search")}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-adm-text outline-none placeholder:text-adm-muted"
            />
          </label>
        </form>

        <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-1 rounded-xl bg-adm-text/6 p-1">
          {flagFilters.map((filter) => (
            <Link
              key={filter.key}
              href={href({ f: filter.key === "all" ? undefined : filter.key })}
              scroll={false}
              aria-current={flag === filter.key ? "page" : undefined}
              className={[
                "inline-flex min-h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[13px] transition-colors",
                flag === filter.key ? "bg-adm-solid font-semibold text-adm-text shadow-xs" : "text-adm-muted hover:text-adm-text",
              ].join(" ")}
            >
              {filter.label} <span className="tabular-nums">{filter.count}</span>
            </Link>
          ))}
        </nav>

        <ChannelSelect label={t("channelFilter")} value={ch} options={channelOptions} />
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
          {editingAgent && (
            <p className="-mt-2 mb-4 text-sm text-adm-muted">
              {editingAgent.company || t("noCompany")}
              {channelOf(editingAgent) ? ` · ${t("via", { channel: channelOf(editingAgent) as string })}` : ""}
            </p>
          )}
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
