"use client";

/**
 * Ownership forms in the unit drawer: "record transfer" for a SOLD unit
 * (creates the Resident and card no. 1) and the ADMIN-only resale form.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Gift, KeyRound, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { errorText, useRunAction, type FormAction } from "./use-resident-action";
import { PURPOSES } from "./purposes";


const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="admin-label">{label}</span>
      {children}
      {hint && <span className="admin-hint block">{hint}</span>}
    </label>
  );
}

export function TransferForm({ action, defaults }: { action: FormAction; defaults: { ownerName: string; nationality: string } }) {
  const { t } = useRunAction();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="admin-btn">
        <KeyRound size={15} aria-hidden />
        {t("transfer.open")}
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-3">
      <h3 className="text-sm font-semibold text-adm-text">{t("transfer.title")}</h3>
      <Field label={t("form.ownerName")}>
        <input name="ownerName" required defaultValue={defaults.ownerName} className="admin-input" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("form.nationality")}>
          <input name="nationality" maxLength={2} defaultValue={defaults.nationality} className="admin-input uppercase" />
        </Field>
        <Field label={t("form.transferDate")}>
          <input name="transferDate" type="date" required defaultValue={todayIso()} className="admin-input" />
        </Field>
        <Field label={t("form.phone")}>
          <input name="phone" type="tel" required placeholder="08X-XXX-XXXX / +7 …" className="admin-input" />
        </Field>
        <Field label={t("form.emailOptional")} hint={t("form.emailHint")}>
          <input name="email" type="email" placeholder="name@example.com" className="admin-input" />
        </Field>
        <Field label={t("form.purpose")}>
          <select name="purpose" defaultValue="own" className="admin-input">
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {t(`purpose.${p}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-adm-muted">{t("transfer.note")}</p>
      {state && !state.ok && <p className="rounded-md bg-adm-danger-bg px-2.5 py-1.5 text-xs text-adm-danger">{errorText(t, state.error)}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="admin-btn">
          <Check size={15} aria-hidden />
          {t("transfer.submit")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="admin-btn-ghost">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export function ResaleForm({
  action,
  closeHref,
  info,
}: {
  action: FormAction;
  closeHref: string;
  info: { nextVersion: number; currentVersion: number; devices: number; overrides: number; pending: number };
}) {
  const { t } = useRunAction();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok) router.replace(closeHref, { scroll: false });
  }, [state, closeHref, router]);

  const effects = [
    { icon: RefreshCw, text: t("resale.effects.card", { next: info.nextVersion, current: info.currentVersion }) },
    { icon: Smartphone, text: t("resale.effects.devices", { count: info.devices }) },
    {
      icon: Gift,
      text:
        t("resale.effects.benefits") +
        (info.overrides ? ` ${t("resale.effects.overrides", { count: info.overrides })}` : "") +
        (info.pending ? ` · ${t("resale.effects.pending", { count: info.pending })}` : ""),
    },
    { icon: ShieldCheck, text: t("resale.effects.pdpa") },
    { icon: Download, text: t("resale.effects.download") },
  ];

  return (
    <form action={formAction} className="space-y-5">
      <section>
        <h3 className="admin-section-title mb-2.5">{t("resale.newOwner")}</h3>
        <div className="space-y-3">
          <Field label={t("form.ownerName")}>
            <input name="ownerName" required autoFocus className="admin-input" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.nationality")}>
              <input name="nationality" maxLength={2} defaultValue="TH" className="admin-input uppercase" />
            </Field>
            <Field label={t("form.transferDate")}>
              <input name="transferDate" type="date" required defaultValue={todayIso()} className="admin-input" />
            </Field>
            <Field label={t("form.phone")}>
              <input name="phone" type="tel" required placeholder="08X-XXX-XXXX / +7 …" className="admin-input" />
            </Field>
            <Field label={t("form.emailRequired")}>
              <input name="email" type="email" required placeholder="name@example.com" className="admin-input" />
            </Field>
          </div>
          <p className="text-[11px] text-adm-muted">{t("form.emailHint")}</p>
        </div>
      </section>
      <section>
        <h3 className="admin-section-title mb-2.5">{t("resale.automatic")}</h3>
        <ul className="space-y-1.5 text-[13px] text-adm-text/85">
          {effects.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2">
              <Icon size={14} className="mt-0.5 shrink-0 text-adm-accent-ink" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </section>
      <label className="flex items-start gap-2 rounded-[10px] border border-adm-line px-3 py-2.5 text-[13px] text-adm-text">
        <input type="checkbox" name="documentsChecked" required className="mt-0.5" />
        {t("resale.documents")}
      </label>
      {state && !state.ok && <p className="rounded-md bg-adm-danger-bg px-2.5 py-1.5 text-xs text-adm-danger">{errorText(t, state.error)}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="admin-btn">
          <Check size={15} aria-hidden />
          {t("resale.submit")}
        </button>
        <button type="button" onClick={() => router.replace(closeHref, { scroll: false })} className="admin-btn-ghost">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
