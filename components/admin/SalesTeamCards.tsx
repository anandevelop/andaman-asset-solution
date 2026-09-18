"use client";

/**
 * components/admin/SalesTeamCards.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One card per member (SalesTeam.dc.html) — who they are, the four numbers
 * that matter, and the switch that puts them on the public site.
 *
 * Every number is computed from the lead timeline (see
 * lib/admin/sales-performance.ts) and none of it is editable here, which
 * is the point of the screen: the team's own dashboard, not a form.
 *
 * A profile with no back-office account cannot be assigned a lead, so its
 * card says so instead of showing four zeroes that read as bad numbers.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ImageOff, Loader2, UserPlus } from "lucide-react";
import { setSalesPersonVisible } from "@/app/[locale]/admin/(crm)/sales-team/actions";

export type TeamCardMember = {
  id: string;
  name: string;
  position: string;
  photoUrl: string | null;
  isActive: boolean;
  hasAccount: boolean;
  /** Locale codes their profile is written in. */
  languages: string[];
  openLeads: number;
  /** Already formatted, e.g. "1 ชม. 24 น." — null when nothing answered. */
  responseLabel: string | null;
  responseIsSlow: boolean;
  viewings30d: number;
  closed90d: number;
};

type Props = {
  locale: string;
  members: TeamCardMember[];
  addHref: string;
  labels: {
    openLeads: string;
    avgResponse: string;
    viewings30d: string;
    closed90d: string;
    showOnSite: string;
    noAccount: string;
    noResponses: string;
    addTitle: string;
    addBody: string;
    error: string;
  };
};

export default function SalesTeamCards({ locale, members, addHref, labels }: Props) {
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

  const Stat = ({
    value,
    label,
    tone,
  }: {
    value: string;
    label: string;
    tone?: "normal" | "warn";
  }) => (
    <div>
      <p
        className={`text-xl font-semibold ${tone === "warn" ? "text-red-700" : "text-primary"}`}
      >
        {value}
      </p>
      <p className={`text-[11px] ${tone === "warn" ? "text-red-700" : "text-ink-muted"}`}>{label}</p>
    </div>
  );

  return (
    <>
      {error && (
        <p className="flex items-center gap-1.5 rounded-xs border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={15} aria-hidden />
          {labels.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {members.map((member) => (
          <div key={member.id} className="admin-card flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xs bg-surface-muted">
                {member.photoUrl ? (
                  /* Plain <img>, like every other admin thumbnail — see
                     ProjectsTable for why next/image is wrong here. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <ImageOff size={16} className="text-ink-muted" aria-hidden />
                )}
              </span>

              <div className="min-w-0">
                <p className="truncate font-semibold text-primary">{member.name}</p>
                <p className="truncate text-xs text-ink-muted">{member.position}</p>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {member.languages.map((code) => (
                    <span
                      key={code}
                      className="rounded-xs bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-muted"
                    >
                      {code}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {member.hasAccount ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-primary/10 pt-3">
                <Stat value={String(member.openLeads)} label={labels.openLeads} />
                <Stat
                  value={member.responseLabel ?? labels.noResponses}
                  label={labels.avgResponse}
                  tone={member.responseIsSlow ? "warn" : "normal"}
                />
                <Stat value={String(member.viewings30d)} label={labels.viewings30d} />
                <Stat value={String(member.closed90d)} label={labels.closed90d} />
              </div>
            ) : (
              <p className="border-t border-primary/10 pt-3 text-xs leading-relaxed text-ink-muted">
                {labels.noAccount}
              </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-primary/10 pt-3">
              <span className="text-xs text-ink-muted">{labels.showOnSite}</span>
              <button
                type="button"
                role="switch"
                aria-checked={member.isActive}
                aria-label={`${labels.showOnSite}: ${member.name}`}
                disabled={pending}
                onClick={() => toggle(member)}
                className={[
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                  member.isActive ? "bg-emerald-500" : "bg-primary/20",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-3.5 w-3.5 transform items-center justify-center rounded-full bg-white shadow-xs transition-transform",
                    member.isActive ? "translate-x-[18px]" : "translate-x-[3px]",
                  ].join(" ")}
                >
                  {busyId === member.id && (
                    <Loader2 size={12} className="animate-spin text-primary" aria-hidden />
                  )}
                </span>
              </button>
            </div>
          </div>
        ))}

        <Link
          href={addHref}
          className="flex flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-primary/25 p-6 text-center transition-colors hover:border-primary/40"
        >
          <UserPlus size={22} className="text-ink-muted" aria-hidden />
          <span className="text-sm font-medium text-primary">{labels.addTitle}</span>
          <span className="text-xs leading-relaxed text-ink-muted">{labels.addBody}</span>
        </Link>
      </div>
    </>
  );
}
