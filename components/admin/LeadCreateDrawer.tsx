"use client";

/**
 * components/admin/LeadCreateDrawer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "+ เพิ่มลีด": a rep records a lead that did not come through the website.
 *
 * A drawer over the leads list rather than a page (the v4 rule for add
 * forms), opened by `?new=1` so Back closes it and the `c` shortcut can
 * link to it from anywhere. On save it hands over to the new lead's own
 * drawer (`?lead=`), which is where the next step — call, book a viewing —
 * already lives.
 *
 * The phone field is the public form's: CountrySelect for the dial code
 * and a national number, normalised server-side by the same helpers
 * (lib/admin/lead-create.ts). The consent box is required — see that file
 * for why it is not pre-ticked or skipped.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, UserPlus, X } from "lucide-react";
import CountrySelect from "@/components/CountrySelect";
import type { Locale } from "@/i18n";
import { createLead, type CreateLeadState } from "@/app/[locale]/admin/(crm)/leads/actions";
import { COMMS_LANGUAGES } from "@/lib/admin/lead-create";
import { LEAD_SOURCES } from "@/lib/validations";
import { showUndoToast } from "@/components/admin/UndoToast";

type Props = {
  locale: string;
  /** Where closing goes: the list with its filters, minus `new`. */
  closeHref: string;
  /** Base for the new lead's drawer: "…/leads?…&lead=". */
  leadHrefBase: string;
  projects: { id: string; name: string }[];
  /** null for SALES: they own what they enter, so there is no choice. */
  assignees: { id: string; name: string }[] | null;
  currentUserId: string;
  sourceLabels: Record<string, string>;
};

export default function LeadCreateDrawer({
  locale,
  closeHref,
  leadHrefBase,
  projects,
  assignees,
  currentUserId,
  sourceLabels,
}: Props) {
  const t = useTranslations("admin.leads.create");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CreateLeadState, FormData>(createLead.bind(null, locale), {
    status: "idle",
  });
  const [phoneCountry, setPhoneCountry] = useState("TH");
  const [nationality, setNationality] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => router.replace(closeHref, { scroll: false });

  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.replace(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  useEffect(() => {
    if (state.status !== "created") return;
    showUndoToast({ message: t("created") });
    router.replace(`${leadHrefBase}${state.leadId}`, { scroll: false });
  }, [state, leadHrefBase, router, t]);

  const errors = state.status === "invalid" ? state.errors : {};
  const fieldError = (key: keyof typeof errors) =>
    errors[key] ? <p className="mt-1 text-xs text-adm-danger">{t(`errors.${errors[key]}` as never)}</p> : null;

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("cancel")}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-adm-band/40 motion-safe:animate-[lead-drawer-fade_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-create-title"
        className="absolute inset-y-2.5 right-2.5 flex w-[min(520px,calc(100vw-20px))] flex-col overflow-hidden rounded-[20px] bg-adm-solid shadow-[var(--adm-shadow-float)] motion-safe:animate-[lead-drawer-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]"
      >
        <div className="flex items-center gap-3 border-b border-adm-line px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-adm-fill/20 text-adm-accent-ink">
            <UserPlus size={18} aria-hidden />
          </span>
          <h2 id="lead-create-title" className="flex-1 text-base font-semibold text-adm-text">
            {t("title")}
          </h2>
          <button type="button" onClick={close} aria-label={t("cancel")} className="admin-btn-quiet admin-btn-sm">
            <X size={16} aria-hidden />
          </button>
        </div>

        <form action={formAction} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div>
              <label htmlFor="lead-name" className="admin-label">
                {t("name")} *
              </label>
              <input id="lead-name" name="name" required className="admin-input" autoComplete="off" />
              {fieldError("name")}
            </div>

            <div>
              <label htmlFor="lead-phone" className="admin-label">
                {t("phone")} *
              </label>
              <div className="flex gap-2">
                <div className="w-[130px] shrink-0">
                  <CountrySelect
                    id="lead-phone-country"
                    variant="dial"
                    value={phoneCountry}
                    onChange={(value) => setPhoneCountry(value ?? "TH")}
                    locale={locale as Locale}
                    placeholder={t("phoneCountry")}
                    searchPlaceholder={t("countrySearch")}
                    noneLabel=""
                    noResultsLabel={t("countryNone")}
                    aria-label={t("phoneCountry")}
                  />
                </div>
                <input type="hidden" name="phoneCountry" value={phoneCountry} />
                <input id="lead-phone" name="phone" type="tel" required className="admin-input" autoComplete="off" />
              </div>
              {fieldError("phone")}
            </div>

            <div>
              <label htmlFor="lead-nationality" className="admin-label">
                {t("nationality")}
              </label>
              {/* The public form's own picker, so the code stored is the
                  same ISO2 and the leads table can draw the same flag. */}
              <CountrySelect
                id="lead-nationality"
                variant="nationality"
                value={nationality}
                onChange={setNationality}
                locale={locale as Locale}
                placeholder={t("nationalityPlaceholder")}
                searchPlaceholder={t("countrySearch")}
                noneLabel={t("nationalityNone")}
                noResultsLabel={t("countryNone")}
                aria-label={t("nationality")}
              />
              <input type="hidden" name="nationality" value={nationality ?? ""} />
            </div>

            <div>
              <label htmlFor="lead-email" className="admin-label">
                {t("email")}
              </label>
              <input id="lead-email" name="email" type="email" className="admin-input" autoComplete="off" />
              <p className="admin-hint">{t("emailHint")}</p>
              {fieldError("email")}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="lead-project" className="admin-label">
                  {t("project")}
                </label>
                <select id="lead-project" name="projectId" className="admin-input" defaultValue="">
                  <option value="">{t("noProject")}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="lead-source" className="admin-label">
                  {t("source")}
                </label>
                <select id="lead-source" name="source" className="admin-input" defaultValue="OTHER">
                  {LEAD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {sourceLabels[source] ?? source}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="lead-language" className="admin-label">
                  {t("language")}
                </label>
                <select id="lead-language" name="commsLanguage" className="admin-input" defaultValue={locale}>
                  <option value="">{t("languageNone")}</option>
                  {COMMS_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {code.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="lead-assignee" className="admin-label">
                  {t("assignee")}
                </label>
                {assignees ? (
                  <select id="lead-assignee" name="assignedToId" className="admin-input" defaultValue={currentUserId}>
                    <option value="">{t("unassigned")}</option>
                    {assignees.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="admin-hint mt-2!">{t("ownedBySelf")}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="lead-message" className="admin-label">
                {t("message")}
              </label>
              <textarea id="lead-message" name="message" className="admin-textarea" maxLength={2000} />
              {fieldError("message")}
            </div>

            <label className="flex items-start gap-2.5 rounded-[12px] border border-adm-line bg-adm-text/4 p-3 text-sm text-adm-text">
              <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 rounded-xs" />
              <span>
                {t("consent")}
                <span className="mt-0.5 block text-xs text-adm-muted">{t("consentHint")}</span>
              </span>
            </label>
            {fieldError("consent")}

            {state.status === "error" && (
              <p role="alert" className="rounded-control bg-adm-danger-bg px-3 py-2 text-sm text-adm-danger">
                {t(`errors.${state.error}` as never)}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-adm-line px-5 py-3">
            <button type="button" onClick={close} className="admin-btn-ghost">
              {t("cancel")}
            </button>
            <button type="submit" disabled={pending} className="admin-btn">
              {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t("submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
