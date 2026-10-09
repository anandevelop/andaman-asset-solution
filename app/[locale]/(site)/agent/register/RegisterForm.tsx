"use client";

/**
 * app/[locale]/(site)/agent/register/RegisterForm.tsx — the mockup's `rf`
 * form. Two separate checkboxes on purpose: the privacy-notice
 * acknowledgement (required) and the news opt-in (optional).
 */

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Link2, Loader2 } from "lucide-react";
import { AGENT_NOTICE_VERSION, PRIVACY_EMAIL } from "@/lib/agents/constants";
import { registerAgent, type AgentRegisterState } from "./actions";

const INPUT =
  "w-full rounded-xs border border-primary/15 bg-white px-4 py-3 text-base text-ink outline-hidden transition-colors focus:border-accent sm:text-sm";
const LABEL = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/70";

export default function RegisterForm({ locale, refSlug, closed }: { locale: string; refSlug: string | null; closed: boolean }) {
  const t = useTranslations("coAgents.agentForm");
  const [state, formAction, pending] = useActionState<AgentRegisterState, FormData>(registerAgent.bind(null, locale, refSlug), {
    status: "idle",
  });
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [round, setRound] = useState(0);

  if (closed || state.status === "closed") {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-ink/5 text-ink/50">
          <Link2 size={24} aria-hidden />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-ink">{t("closed")}</h2>
        <p className="text-sm text-ink-muted">{t("closedText")}</p>
      </div>
    );
  }

  if (state.status === "done" && round === 0) {
    return (
      <div className="py-10 text-center" role="status">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#e6f4ec] text-[#15704a]">
          <Check size={26} aria-hidden />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-ink">{t("done")}</h2>
        <p className="mb-6 text-sm text-ink-muted">{t("doneText")}</p>
        <button type="button" className="btn-outline" onClick={() => setRound(1)}>
          {t("again")}
        </button>
      </div>
    );
  }

  const error = state.status === "error" && round === 0 ? t(state.error) : null;

  return (
    <form
      action={(data) => {
        setRound(0);
        formAction(data);
      }}
      className="relative space-y-5"
      noValidate
    >
      {/* Honeypot — hidden from humans; the action ignores a filled one. */}
      <input type="text" name="company_url" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0" />

      <label className="block">
        <span className={LABEL}>{t("name")} *</span>
        <input name="name" required autoComplete="name" maxLength={120} className={INPUT} />
      </label>
      <label className="block">
        <span className={LABEL}>{t("company")}</span>
        <input name="company" autoComplete="organization" maxLength={120} className={INPUT} />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t("phone")}</span>
          <input name="phone" type="tel" autoComplete="tel" maxLength={40} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>{t("whatsapp")}</span>
          <input name="whatsapp" type="tel" placeholder="+" maxLength={40} className={INPUT} />
          <small className="mt-1 block text-xs text-ink-muted">{t("whatsappHint")}</small>
        </label>
      </div>
      <label className="block">
        <span className={LABEL}>{t("email")}</span>
        <input name="email" type="email" autoComplete="email" maxLength={200} className={INPUT} />
      </label>

      <div>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-ink/80">
          <input type="checkbox" name="notice" required className="mt-0.5 h-4 w-4 shrink-0 accent-accent-600" />
          <span>{t("notice")} *</span>
        </label>
        <button
          type="button"
          className="ml-7 mt-1 text-xs text-ink-muted underline decoration-dotted underline-offset-2 hover:text-primary"
          aria-expanded={noticeOpen}
          aria-controls="agent-notice"
          onClick={() => setNoticeOpen((open) => !open)}
        >
          {t("noticeToggle")}
        </button>
        {noticeOpen && (
          <div id="agent-notice" className="ml-7 mt-2 rounded-xs bg-ink/[0.04] p-3 text-xs leading-relaxed text-ink/75">
            <b className="mb-1 block text-ink">{t("noticeTitle")}</b>
            <p>{t("noticeText")}</p>
            <p className="mt-2">{t("noticeContact", { email: PRIVACY_EMAIL })}</p>
            <p className="mt-1 text-ink-muted">{t("noticeVersion", { version: AGENT_NOTICE_VERSION })}</p>
          </div>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink/80">
        <input type="checkbox" name="news" className="mt-0.5 h-4 w-4 shrink-0 accent-accent-600" />
        <span>{t("news")}</span>
      </label>

      {error && (
        <p role="alert" className="rounded-xs bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
