"use client";

/**
 * The drawer's editable resident bits: the OTP e-mail and the household
 * members (max 2). The e-mail box starts empty rather than pre-filled —
 * the full address never reaches the page, only its masked form.
 */

import { useActionState, useState } from "react";
import { useLocale } from "next-intl";
import { Mail, Pencil, Plus, UserMinus } from "lucide-react";
import { removeMember } from "@/app/[locale]/admin/(club)/residents/actions";
import { MAX_HOUSEHOLD_MEMBERS, MEMBER_RELATIONS } from "@/lib/club/constants";
import { formatDateShort } from "@/lib/format";
import Avatar from "@/components/admin/ui/Avatar";
import type { ResidentActionResult } from "@/app/[locale]/admin/(club)/residents/actions";
import { errorText, useRunAction, type FormAction } from "./use-resident-action";

export function EmailEditor({ maskedEmail, action }: { maskedEmail: string | null; action: FormAction }) {
  const { t } = useRunAction();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ResidentActionResult | null, FormData>(async (prev, form) => {

    const result = await action(prev, form);

    if (result.ok) setOpen(false);

    return result;

  }, null);

  return (
    <div className="mt-1 text-xs text-adm-muted">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Mail size={12} aria-hidden />
        {maskedEmail ? (
          <span className="admin-mono text-adm-text">{maskedEmail}</span>
        ) : (
          <span className="rounded-full bg-adm-warning/13 px-2 py-0.5 text-[10.5px] font-medium text-adm-warning">{t("resident.noEmailPortal")}</span>
        )}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-adm-line-strong px-2 py-0.5 text-[10.5px] font-medium text-adm-muted hover:border-adm-info hover:text-adm-info"
          >
            <Pencil size={11} aria-hidden />
            {maskedEmail ? t("resident.editEmail") : t("resident.addEmail")}
          </button>
        )}
      </span>
      {open && (
        <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input name="email" type="email" required autoFocus placeholder="name@example.com" className="admin-input max-w-[260px] flex-1" />
          <button type="submit" disabled={pending} className="admin-btn admin-btn-sm">
            {t("common.save")}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="admin-btn-ghost admin-btn-sm">
            {t("common.cancel")}
          </button>
          <p className="basis-full text-[11px] text-adm-muted">
            {t("resident.emailHint")}
            {maskedEmail ? ` · ${t("resident.emailNotifyOld")}` : ""}
          </p>
          {state && !state.ok && <p className="basis-full rounded-md bg-adm-danger-bg px-2.5 py-1.5 text-xs text-adm-danger">{errorText(t, state.error)}</p>}
        </form>
      )}
    </div>
  );
}

export type MemberRow = { id: string; name: string; relation: string; maskedEmail: string; addedBy: string; createdAt: Date };

export function MembersEditor({ members, addAction }: { members: MemberRow[]; addAction: FormAction }) {
  const locale = useLocale();
  const { t, run, pending: removing } = useRunAction();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ResidentActionResult | null, FormData>(async (prev, form) => {

    const result = await addAction(prev, form);

    if (result.ok) setOpen(false);

    return result;

  }, null);

  const relationLabel = (relation: string) => (t.has(`relations.${relation}`) ? t(`relations.${relation}`) : relation);

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-adm-text">
        {t("members.title")} <span className="text-adm-muted">({members.length}/{MAX_HOUSEHOLD_MEMBERS})</span>
        {members.length < MAX_HOUSEHOLD_MEMBERS && !open && (
          <button type="button" onClick={() => setOpen(true)} className="admin-btn-quiet admin-btn-sm ml-auto">
            <Plus size={13} aria-hidden />
            {t("members.add")}
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-2.5 rounded-[10px] border border-adm-line px-2.5 py-2">
            <Avatar id={member.id} name={member.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-adm-text">
                {member.name}{" "}
                <span className="ml-1 rounded-full bg-adm-text/6 px-1.5 py-0.5 text-[10.5px] font-normal text-adm-muted">{relationLabel(member.relation)}</span>
              </p>
              <p className="truncate text-[11px] text-adm-muted">
                <span className="admin-mono">{member.maskedEmail}</span> ·{" "}
                {t("members.addedBy", { name: member.addedBy, date: formatDateShort(locale, new Date(member.createdAt)) })}
              </p>
            </div>
            <button
              type="button"
              disabled={removing}
              onClick={() => run(() => removeMember(member.id))}
              className="admin-btn-ghost admin-btn-sm"
            >
              <UserMinus size={13} aria-hidden />
              {t("members.remove")}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <form action={formAction} className="mt-2 grid gap-2 rounded-[10px] border border-adm-line p-2.5 sm:grid-cols-[1fr_auto]">
          <input name="name" required autoFocus placeholder={t("members.namePlaceholder")} className="admin-input" />
          <select name="relation" className="admin-input" defaultValue={MEMBER_RELATIONS[0]}>
            {MEMBER_RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {relationLabel(relation)}
              </option>
            ))}
          </select>
          <input name="email" type="email" required placeholder="name@example.com" className="admin-input sm:col-span-2" />
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={pending} className="admin-btn admin-btn-sm">
              {t("common.save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="admin-btn-ghost admin-btn-sm">
              {t("common.cancel")}
            </button>
          </div>
          {state && !state.ok && <p className="rounded-md bg-adm-danger-bg px-2.5 py-1.5 text-xs text-adm-danger sm:col-span-2">{errorText(t, state.error)}</p>}
        </form>
      )}
      <p className="mt-1.5 text-[11px] text-adm-muted">{t("members.hint")}</p>
    </div>
  );
}
