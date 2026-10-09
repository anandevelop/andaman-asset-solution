"use client";

/**
 * components/admin/agents/AgentForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The agent drawer (the mockup's agentDrawer): editable fields, the leads
 * this agent sent, the PDPA record (notice version / time / language /
 * news opt-in), and erasure on the data subject's request (ADMIN+).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Send, ShieldCheck, Trash2 } from "lucide-react";
import { approveAgent, deleteAgent, saveAgent, type AgentFormState } from "@/app/[locale]/admin/(crm)/agents/actions";
import { useFlash } from "@/components/admin/agents/Flash";
import { fmtDateTime } from "@/components/admin/agents/ui";

export type AgentFormValues = {
  id: string | null;
  name: string;
  company: string;
  phone: string;
  whatsapp: string;
  email: string;
  salesPersonId: string;
  pending: boolean;
  selfRegistered: boolean;
  channelLabel: string;
  consent: { version: string; at: string; locale: string; news: boolean } | null;
  leads: { id: string; name: string; status: string; project: string | null }[];
};

export default function AgentForm({
  locale,
  values,
  salesPeople,
  companies,
  closeHref,
  canErase,
}: {
  locale: string;
  values: AgentFormValues;
  salesPeople: { id: string; label: string }[];
  companies: string[];
  closeHref: string;
  canErase: boolean;
}) {
  const t = useTranslations("coAgents.agents");
  const router = useRouter();
  const [flash, show] = useFlash();
  const [state, formAction, saving] = useActionState<AgentFormState, FormData>(saveAgent.bind(null, locale, values.id), { ok: false });
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) router.replace(closeHref, { scroll: false });
  }, [state, closeHref, router]);

  const err = (key: string) => (state.fields?.[key] ? <small className="mt-1 block text-xs text-adm-danger">{state.fields[key]}</small> : null);
  const h5 = "mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-adm-muted";

  return (
    <form action={formAction} noValidate>
      {flash}
      <div className="mb-6">
        <h5 className={h5}>{t("sectionInfo")}</h5>
        <label className="mb-3 block">
          <span className="admin-label">{t("name")}</span>
          <input name="name" defaultValue={values.name} maxLength={120} className="admin-input" autoFocus />
          {err("name")}
        </label>
        <label className="mb-3 block">
          <span className="admin-label">{t("company")}</span>
          <input name="company" defaultValue={values.company} list="agent-companies" placeholder={t("companyPlaceholder")} className="admin-input" />
          <datalist id="agent-companies">
            {companies.map((company) => (
              <option key={company} value={company} />
            ))}
          </datalist>
        </label>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="admin-label">{t("phone")}</span>
            <input name="phone" type="tel" defaultValue={values.phone} placeholder={t("phonePlaceholder")} className="admin-input" />
            {err("phone")}
          </label>
          <label className="block">
            <span className="admin-label">{t("whatsapp")}</span>
            <input name="whatsapp" type="tel" defaultValue={values.whatsapp} placeholder="+66 / +7 …" className="admin-input" />
            <small className="admin-hint block">{t("whatsappHint")}</small>
          </label>
        </div>
        <label className="mb-3 block">
          <span className="admin-label">{t("email")}</span>
          <input name="email" type="email" defaultValue={values.email} placeholder="name@example.com" className="admin-input" />
          {err("email")}
        </label>
        <label className="block">
          <span className="admin-label">{t("channel")}</span>
          <select name="salesPersonId" defaultValue={values.salesPersonId} className="admin-input">
            <option value="">{values.selfRegistered && !values.salesPersonId ? t("channelWebsite") : t("channelNone")}</option>
            {salesPeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
          <small className="admin-hint block">{t("channelHint")}</small>
        </label>
      </div>

      {values.id && (
        <div className="mb-6">
          <h5 className={h5}>{t("leadsTitle", { count: values.leads.length })}</h5>
          {values.leads.length ? (
            <ul className="divide-y divide-adm-line">
              {values.leads.map((lead) => (
                <li key={lead.id} className="flex items-center gap-2 py-2 text-sm">
                  <Link href={`/${locale}/admin/leads/${lead.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {lead.name}
                  </Link>
                  {lead.project && <span className="text-xs text-adm-muted">{lead.project}</span>}
                  <span className="rounded-full bg-adm-text/5 px-2 py-0.5 text-[11px] text-adm-muted">{lead.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-adm-muted">{t("noLeads")}</span>
          )}
        </div>
      )}

      {values.id && (
        <div className="mb-6">
          <h5 className={h5}>{t("consentTitle")}</h5>
          {values.consent ? (
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-adm-success-bg text-adm-success">
                <ShieldCheck size={16} aria-hidden />
              </span>
              <div className="text-sm">
                <b className="block font-medium text-adm-text">{t("consentOk", { version: values.consent.version })}</b>
                <small className="text-[11.5px] text-adm-muted">
                  {t("consentMeta", {
                    date: fmtDateTime(values.consent.at, locale),
                    channel: values.channelLabel,
                    locale: values.consent.locale.toUpperCase(),
                  })}{" "}
                  · {values.consent.news ? t("newsYes") : t("newsNo")}
                </small>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-adm-warning-bg text-adm-warning">
                <AlertTriangle size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <b className="block font-medium text-adm-text">{t("consentMissing")}</b>
                <small className="text-[11.5px] text-adm-muted">{t("consentMissingHint")}</small>
              </div>
              {/* TODO: send the registration link to the agent once outbound
                  WhatsApp/email for agents exists; for now this only says so. */}
              <button type="button" className="admin-btn-ghost admin-btn-sm" onClick={() => show(t("requestConsentToast", { name: values.name }))}>
                <Send size={13} aria-hidden /> {t("requestConsent")}
              </button>
            </div>
          )}
          {canErase && (
            <button
              type="button"
              className="admin-btn-quiet admin-btn-sm mt-2 text-adm-danger!"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("eraseConfirm", { name: values.name }))) return;
                startTransition(async () => {
                  const result = await deleteAgent(locale, values.id as string);
                  if (result.ok) router.replace(closeHref, { scroll: false });
                  else setError(t("errGeneric"));
                });
              }}
            >
              <Trash2 size={13} aria-hidden /> {t("erase")}
            </button>
          )}
        </div>
      )}

      {((state.message && !state.ok) || error) && (
        <p role="alert" className="mb-3 rounded-[10px] bg-adm-danger-bg px-3 py-2 text-sm text-adm-danger">
          {error ?? state.message}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-2 border-t border-adm-line bg-adm-solid px-5 py-3">
        <button type="submit" className="admin-btn" disabled={saving || busy}>
          <Check size={15} aria-hidden />
          {saving ? t("saving") : t("save")}
        </button>
        {values.id && values.pending && (
          <button
            type="button"
            className="admin-btn-navy"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const result = await approveAgent(locale, values.id as string);
                if (result.ok) router.replace(closeHref, { scroll: false });
                else setError(t("errGeneric"));
              })
            }
          >
            {t("approve")}
          </button>
        )}
        <button type="button" className="admin-btn-ghost" onClick={() => router.replace(closeHref, { scroll: false })}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
