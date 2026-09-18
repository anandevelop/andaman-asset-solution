"use client";

/**
 * components/admin/LeadRoutingPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "การกระจายลีดอัตโนมัติ" — the rules that decide who a new enquiry goes
 * to, read-only until you press edit.
 *
 * The escalation row is labelled differently from the others on purpose.
 * Language routing and the per-person cap are applied the moment a lead
 * arrives; the escalation cannot be, because nothing in this application
 * runs on a timer (see lib/lead-routing.ts's header). It is stored and it
 * drives the overdue flag on the leads board, and the panel says exactly
 * that rather than implying a handover happens by itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Info, Loader2, Pencil, X } from "lucide-react";
import { updateLeadRouting } from "@/app/[locale]/admin/(crm)/sales-team/actions";

export type RoutingMember = { userId: string; name: string };

type Props = {
  locale: string;
  canEdit: boolean;
  members: RoutingMember[];
  /** Locale code → label, in the admin's display order. */
  languages: { code: string; label: string }[];
  rules: {
    enabled: boolean;
    byLanguage: Record<string, string>;
    perPersonCap: number;
    escalateAfterHours: number;
    teamLeadUserId: string | null;
  };
  labels: {
    title: string;
    enabled: string;
    languageRule: string;
    noPreference: string;
    perPersonCap: string;
    capUnit: string;
    escalate: string;
    escalateValue: string;
    escalateNote: string;
    teamLead: string;
    edit: string;
    cancel: string;
    save: string;
    auditNote: string;
    disabledNote: string;
    readOnlyNote: string;
    error: string;
    none: string;
  };
};

export default function LeadRoutingPanel({
  locale,
  canEdit,
  members,
  languages,
  rules,
  labels,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rules);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const nameOf = (userId: string | null) =>
    (userId && members.find((member) => member.userId === userId)?.name) || labels.none;

  const save = () => {
    setError(false);
    startTransition(async () => {
      const result = await updateLeadRouting(locale, {
        enabled: draft.enabled,
        byLanguage: draft.byLanguage,
        perPersonCap: draft.perPersonCap,
        escalateAfterHours: draft.escalateAfterHours,
        teamLeadUserId: draft.teamLeadUserId ?? "",
      });

      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(true);
      }
    });
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="text-right text-sm text-primary">{children}</dd>
    </div>
  );

  return (
    <section className="admin-card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary">{labels.title}</h2>

        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(rules);
              setEditing(true);
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:text-accent-800"
          >
            <Pencil size={13} aria-hidden />
            {labels.edit}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-primary/10 pb-3">
        <span className="text-sm text-primary">{labels.enabled}</span>
        <button
          type="button"
          role="switch"
          aria-checked={editing ? draft.enabled : rules.enabled}
          aria-label={labels.enabled}
          disabled={!editing || pending}
          onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
          className={[
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
            (editing ? draft.enabled : rules.enabled) ? "bg-emerald-500" : "bg-primary/20",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform",
              (editing ? draft.enabled : rules.enabled) ? "translate-x-[18px]" : "translate-x-[3px]",
            ].join(" ")}
          />
        </button>
      </div>

      {editing ? (
        <div className="space-y-3">
          {languages.map((language) => (
            <div key={language.code}>
              <label className="admin-label" htmlFor={`routing-${language.code}`}>
                {labels.languageRule.replace("{language}", language.label)}
              </label>
              <select
                id={`routing-${language.code}`}
                value={draft.byLanguage[language.code] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    byLanguage: { ...current.byLanguage, [language.code]: event.target.value },
                  }))
                }
                className="admin-input py-1.5! text-sm"
              >
                <option value="">{labels.noPreference}</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div>
            <label className="admin-label" htmlFor="routing-cap">
              {labels.perPersonCap}
            </label>
            <input
              id="routing-cap"
              type="number"
              min={1}
              max={500}
              value={draft.perPersonCap}
              onChange={(event) =>
                setDraft((current) => ({ ...current, perPersonCap: Number(event.target.value) }))
              }
              className="admin-input py-1.5! text-sm"
            />
          </div>

          <div>
            <label className="admin-label" htmlFor="routing-escalate">
              {labels.escalate}
            </label>
            <input
              id="routing-escalate"
              type="number"
              min={0.5}
              max={72}
              step={0.5}
              value={draft.escalateAfterHours}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  escalateAfterHours: Number(event.target.value),
                }))
              }
              className="admin-input py-1.5! text-sm"
            />
            <p className="admin-hint">{labels.escalateNote}</p>
          </div>

          <div>
            <label className="admin-label" htmlFor="routing-lead">
              {labels.teamLead}
            </label>
            <select
              id="routing-lead"
              value={draft.teamLeadUserId ?? ""}
              onChange={(event) =>
                setDraft((current) => ({ ...current, teamLeadUserId: event.target.value || null }))
              }
              className="admin-input py-1.5! text-sm"
            >
              <option value="">{labels.none}</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={save} disabled={pending} className="admin-btn py-2! text-xs">
              {pending ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Check size={13} aria-hidden />
              )}
              {labels.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(false);
              }}
              disabled={pending}
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-primary"
            >
              <X size={13} aria-hidden />
              {labels.cancel}
            </button>
          </div>
        </div>
      ) : (
        <dl className="divide-y divide-primary/5">
          {languages
            .filter((language) => rules.byLanguage[language.code])
            .map((language) => (
              <Row key={language.code} label={labels.languageRule.replace("{language}", language.label)}>
                {nameOf(rules.byLanguage[language.code])}
              </Row>
            ))}

          <Row label={labels.perPersonCap}>
            {rules.perPersonCap} {labels.capUnit}
          </Row>

          <Row label={labels.escalate}>
            <span className="text-ink-muted">
              {labels.escalateValue
                .replace("{hours}", String(rules.escalateAfterHours))
                .replace("{name}", nameOf(rules.teamLeadUserId))}
            </span>
          </Row>
        </dl>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {labels.error}
        </p>
      )}

      {!rules.enabled && !editing && (
        <p className="rounded-xs bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
          {labels.disabledNote}
        </p>
      )}

      {/* The promise the mockup makes, and the one this can keep. */}
      <p className="flex items-start gap-2 rounded-xs bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        {labels.auditNote}
      </p>

      {!canEdit && (
        <p className="text-[11px] text-ink-muted">{labels.readOnlyNote}</p>
      )}
    </section>
  );
}
