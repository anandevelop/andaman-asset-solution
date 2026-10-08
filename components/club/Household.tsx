"use client";
/**
 * components/club/Household.tsx — the owner's household controls on the
 * Account page: "เพิ่มคนในบ้าน" (up to two people, each gets OTP codes at
 * their own address) and "เอาออก" (confirms first; the server action also
 * signs that person's phones out).
 */
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { addMemberAction, removeMemberAction } from "@/app/[locale]/club/actions";
import { MEMBER_RELATIONS } from "@/lib/club/constants";
import type { MemberState } from "./types";
import { btnPrimary, btnSecondary, field, focusRing } from "./ui";

export function RemoveMemberButton({ memberId, label, confirmText }: { memberId: string; label: string; confirmText: string }) {
  return (
    <form action={removeMemberAction}>
      <input type="hidden" name="memberId" value={memberId} />
      <button
        type="submit"
        onClick={(e) => {
          if (!window.confirm(`${confirmText}?`)) e.preventDefault();
        }}
        aria-label={confirmText}
        className={`min-h-11 rounded-full px-2 text-[13px] text-club-accent underline underline-offset-[3px] ${focusRing}`}
      >
        {label}
      </button>
    </form>
  );
}

type Labels = {
  add: string;
  more: string;
  name: string;
  relation: string;
  email: string;
  save: string;
  cancel: string;
  added: string;
  relations: Record<string, string>;
  errors: Record<NonNullable<MemberState["error"]>, string>;
};

export function AddMemberForm({ locale, remaining, labels }: { locale: string; remaining: number; labels: Labels }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMemberAction, {});
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const savedSinceOpen = Boolean(state.ok && state.at && openedAt && state.at > openedAt);
  const open = openedAt !== null && !savedSinceOpen;

  if (!open) {
    return (
      <>
        {savedSinceOpen ? (
          <p role="status" className="py-2 text-[12.5px] text-verify-ok">
            {labels.added}
          </p>
        ) : null}
        {remaining > 0 ? (
          <button type="button" onClick={() => setOpenedAt(Date.now())} className={`flex min-h-12 w-full items-center gap-3 py-2 text-left text-[14px] text-club-text ${focusRing}`}>
            <Plus size={18} className="text-club-text-2" aria-hidden />
            <span className="flex-1">{labels.add}</span>
            <span className="text-[12.5px] text-club-text-3">{labels.more.replace("{n}", String(remaining))}</span>
          </button>
        ) : null}
      </>
    );
  }

  return (
    <form action={action} className="space-y-2.5 py-3" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <label className="block">
        <span className="sr-only">{labels.name}</span>
        <input name="name" required maxLength={80} placeholder={labels.name} autoComplete="name" className={field} />
      </label>
      <label className="block">
        <span className="sr-only">{labels.relation}</span>
        <select name="relation" defaultValue={MEMBER_RELATIONS[0]} className={field}>
          {MEMBER_RELATIONS.map((r) => (
            <option key={r} value={r}>
              {labels.relations[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">{labels.email}</span>
        <input name="email" type="email" required maxLength={160} placeholder="name@example.com" autoComplete="email" inputMode="email" className={field} />
      </label>
      <p role="alert" className="min-h-5 text-[12.5px] text-verify-bad">
        {state.error && state.at && openedAt && state.at > openedAt ? labels.errors[state.error] : ""}
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {labels.save}
        </button>
        <button type="button" onClick={() => setOpenedAt(null)} className={btnSecondary}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
