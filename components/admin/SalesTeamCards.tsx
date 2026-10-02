"use client";

/**
 * components/admin/SalesTeamCards.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One card per member (SalesTeam.dc.html) — who they are, how to reach
 * them, and the switch that puts them on the public site. Editing opens a
 * drawer (`?edit=`), not a form under the grid.
 *
 * A profile with no back-office account cannot be assigned a lead, so its
 * card says so.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, MessageCircle, Pencil } from "lucide-react";
import { setSalesPersonVisible } from "@/app/[locale]/admin/(crm)/sales-team/actions";
import AdminImage from "@/components/admin/ui/AdminImage";
import Avatar from "@/components/admin/ui/Avatar";
import LocaleFlags from "@/components/admin/ui/LocaleFlags";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";

export type TeamCardMember = {
  id: string;
  name: string;
  position: string;
  photoUrl: string | null;
  isActive: boolean;
  hasAccount: boolean;
  /**
   * Linked to an account, but one the lead router will skip — a role below
   * SALES cannot act on a lead, so assigning one would park it where nobody
   * can change its status.
   */
  accountCannotTakeLeads: boolean;
  /** Locale codes their profile is written in. */
  languages: string[];
  /** No Thai name yet: the Thai site would show the English one. */
  missingThai: boolean;
  phone: string;
  whatsapp: string;
  email: string | null;
};

type Props = {
  locale: string;
  members: TeamCardMember[];
  /** "?edit=" plus an id opens that person's drawer; null for a role that
   *  may look but not change the roster. */
  editHrefBase: string | null;
  labels: {
    showOnSite: string;
    onSite: string;
    missingThai: string;
    noAccount: string;
    accountCannotTakeLeads: string;
    edit: string;
    message: string;
    error: string;
  };
};

/**
 * Centred cards, four across (the v4 mockup): who they are and how to
 * reach them. The numbers moved to the workload card and the performance
 * table below, which compare people — a number alone on a card did not.
 */
export default function SalesTeamCards({ locale, members, editHrefBase, labels }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (member: TeamCardMember) => {
    setError(false);
    setBusyId(member.id);
    startTransition(async () => {
      const result = await setSalesPersonVisible(locale, member.id, !member.isActive);
      setBusyId(null);
      if (result.ok) router.refresh();
      else setError(true);
    });
  };

  return (
    <>
      {error && (
        <p className="flex items-center gap-1.5 rounded-control border border-adm-danger/30 bg-adm-danger-bg px-4 py-2.5 text-sm text-adm-danger">
          <AlertCircle size={15} aria-hidden />
          {labels.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {members.map((member, index) => (
          <div key={member.id} className="admin-card relative flex flex-col items-center text-center">
            <span className="admin-mono absolute left-3.5 top-3 text-[11px] text-adm-muted">#{index + 1}</span>

            {member.photoUrl ? (
              <AdminImage
                src={member.photoUrl}
                loading="lazy"
                iconSize={20}
                className="mt-2 h-[72px] w-[72px] rounded-full object-cover"
              />
            ) : (
              <Avatar id={member.id} name={member.name} size="xl" className="mt-2" />
            )}

            <p className="mt-3 max-w-full truncate text-sm font-semibold text-adm-text">{member.name}</p>
            <p className="max-w-full truncate text-xs text-adm-muted">{member.position}</p>
            <span className="mt-2">
              <LocaleFlags
                locales={LOCALE_DISPLAY_ORDER.map((code) => ({
                  locale: code,
                  state: member.languages.includes(code) ? "complete" : "missing",
                }))}
              />
            </span>

            <div className="mt-3 w-full space-y-1 border-t border-adm-line pt-3 text-left">
              <p className="admin-mono truncate text-xs text-adm-text">{member.phone}</p>
              {member.email && <p className="admin-mono truncate text-xs text-adm-muted">{member.email}</p>}
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {member.isActive && (
                <span className="rounded-full bg-adm-success-bg px-2 py-0.5 text-[11px] font-medium text-adm-success">
                  {labels.onSite}
                </span>
              )}
              {member.missingThai && (
                <span className="rounded-full bg-adm-warning-bg px-2 py-0.5 text-[11px] font-medium text-adm-warning">
                  {labels.missingThai}
                </span>
              )}
              {!member.hasAccount && (
                <span
                  title={labels.noAccount}
                  className="rounded-full bg-adm-neutral-bg px-2 py-0.5 text-[11px] text-adm-neutral"
                >
                  {labels.noAccount}
                </span>
              )}
              {member.accountCannotTakeLeads && (
                <span className="rounded-full bg-adm-warning-bg px-2 py-0.5 text-[11px] text-adm-warning">
                  {labels.accountCannotTakeLeads}
                </span>
              )}
            </div>

            <div className="mt-auto flex w-full items-center gap-1.5 pt-4">
              {editHrefBase && (
                <Link href={`${editHrefBase}${member.id}`} scroll={false} className="admin-btn-ghost admin-btn-sm">
                  <Pencil size={13} aria-hidden />
                  {labels.edit}
                </Link>
              )}
              {member.whatsapp && (
                <a
                  href={`https://wa.me/${member.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${labels.message}: ${member.name}`}
                  title={labels.message}
                  className="admin-btn-quiet admin-btn-sm"
                >
                  <MessageCircle size={14} aria-hidden />
                </a>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={member.isActive}
                aria-label={`${labels.showOnSite}: ${member.name}`}
                title={labels.showOnSite}
                disabled={pending || !editHrefBase}
                onClick={() => toggle(member)}
                className={[
                  "relative ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                  member.isActive ? "bg-adm-success" : "bg-adm-text/20",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-3.5 w-3.5 transform items-center justify-center rounded-full bg-white shadow-xs transition-transform",
                    member.isActive ? "translate-x-[18px]" : "translate-x-[3px]",
                  ].join(" ")}
                >
                  {busyId === member.id && <Loader2 size={12} className="animate-spin text-adm-band" aria-hidden />}
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
