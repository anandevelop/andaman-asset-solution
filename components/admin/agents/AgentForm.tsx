"use client";

/**
 * components/admin/agents/AgentForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The agent drawer, in the order it is used: reach the agent (call /
 * WhatsApp / email), see the customers they sent, then the editable
 * fields and the PDPA record (notice version / time / language / news
 * opt-in). Erasure on the data subject's request (ADMIN+) sits in the
 * footer, away from Save.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { useKeepValuesOnError } from "@/components/forms/use-keep-values-on-error";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Mail, MessageCircle, Phone, Send, ShieldCheck, Trash2 } from "lucide-react";
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
  const keepValues = useKeepValuesOnError(state, !state.ok);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) router.replace(closeHref, { scroll: false });
  }, [state, closeHref, router]);

  const err = (key: string) => (state.fields?.[key] ? <small className="mt-1 block text-xs text-adm-danger">{state.fields[key]}</small> : null);
  const h5 = "mb-3 text-sm font-semibold text-adm-text";
  const contactBtn = "flex flex-col items-center gap-1.5 rounded-xl px-2 py-3.5 text-[13px] font-medium";

  return (
    <form ref={keepValues} action={formAction} noValidate>
      {flash}
      {values.id && (values.phone || values.whatsapp || values.email) && (
        <div className="mb-6 grid grid-cols-3 gap-2.5">
          {values.phone && (
            <a href={`tel:${values.phone.replace(/[^\d+]/g, "")}`} className={`${contactBtn} bg-adm-strong text-adm-on-strong`}>
              <Phone size={18} aria-hidden /> {t("call")}
            </a>
          )}
          {values.whatsapp && (
            <a
              href={`https://wa.me/${values.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${contactBtn} border border-adm-line-strong bg-adm-panel text-adm-text`}
            >
              <MessageCircle size={18} aria-hidden /> WhatsApp
            </a>
          )}
          {values.email && (
            <a href={`mailto:${values.email}`} className={`${contactBtn} border border-adm-line-strong bg-adm-panel text-adm-text`}>
              <Mail size={18} aria-hidden /> {t("email")}
            </a>
          )}
        </div>
      )}

      {values.id && (
        <div className="mb-6">
          <h5 className={h5}>{t("leadsTitle", { count: values.leads.length })}</h5>
          {values.leads.length ? (
            <ul className="divide-y divide-adm-line rounded-xl shadow-[0_0_0_1px_var(--adm-line)]">
              {values.leads.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/${locale}/admin/leads/${lead.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-adm-text/[0.025]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-adm-text">{lead.name}</span>
                      {lead.project && <span className="block truncate text-[12.5px] text-adm-muted">{lead.project}</span>}
                    </span>
                    <span className="shrink-0 rounded-full bg-adm-neutral-bg px-2 py-0.5 text-[11.5px] font-medium text-adm-neutral">{lead.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-adm-muted">{t("noLeads")}</span>
          )}
        </div>
      )}

      <div className="mb-6">
        <h5 className={h5}>{t("sectionInfo")}</h5>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="admin-label">{t("name")}</span>
            <input name="name" defaultValue={values.name} maxLength={120} className="admin-input" autoFocus={!values.id} />
            {err("name")}
          </label>
          <label className="block">
            <span className="admin-label">{t("company")}</span>
            <input name="company" defaultValue={values.company} list="agent-companies" placeholder={t("companyPlaceholder")} className="admin-input" />
            <datalist id="agent-companies">
              {companies.map((company) => (
                <option key={company} value={company} />
              ))}
            </datalist>
          </label>
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
          <label className="block">
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
      </div>

      {values.id && (
        <div className="mb-6">
          <h5 className={h5}>{t("consentTitle")}</h5>
          {values.consent ? (
            <div className="flex items-start gap-3 rounded-xl bg-adm-success-bg px-4 py-3.5 text-adm-success">
              <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <b className="block font-semibold">{t("consentOk", { version: values.consent.version })}</b>
                <small className="text-[12.5px]">
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
            <div className="flex flex-wrap items-start gap-3 rounded-xl bg-adm-warning-bg px-4 py-3.5 text-adm-warning">
              <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-[1_1_14rem] text-sm">
                <b className="block font-semibold">{t("consentMissing")}</b>
                <small className="text-[12.5px]">{t("consentMissingHint")}</small>
              </div>
              {/* TODO: send the registration link to the agent once outbound
                  WhatsApp/email for agents exists; for now this only says so. */}
              <button type="button" className="admin-btn-ghost admin-btn-sm" onClick={() => show(t("requestConsentToast", { name: values.name }))}>
                <Send size={13} aria-hidden /> {t("requestConsent")}
              </button>
            </div>
          )}
        </div>
      )}

      {((state.message && !state.ok) || error) && (
        <p role="alert" className="mb-3 rounded-[10px] bg-adm-danger-bg px-3 py-2 text-sm text-adm-danger">
          {error ?? state.message}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-adm-line bg-adm-solid px-5 py-3">
        {values.id && canErase && (
          <button
            type="button"
            className="admin-btn-quiet px-2! text-adm-danger!"
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
            <Trash2 size={14} aria-hidden /> {t("eraseShort")}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className="admin-btn-ghost" onClick={() => router.replace(closeHref, { scroll: false })}>
          {t("cancel")}
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
        <button type="submit" className="admin-btn" disabled={saving || busy}>
          <Check size={15} aria-hidden />
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
