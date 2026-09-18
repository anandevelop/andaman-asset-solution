"use client";

/**
 * components/admin/LeadActivityComposer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Four tabs — Note / Call / Email / Appointment — replacing the single
 * plain textarea LeadNoteForm.tsx used to be the only way to add to a
 * lead's activity feed.
 *
 * Note/Call/Email all post through the same addLeadNote action with a
 * different `kind` (see LeadNoteKind in schema.prisma) — they are the
 * same shape of record, just tagged differently for the timeline's icon.
 * Appointment is not a LeadNote at all: it creates a real Appointment row
 * via the *existing* createAppointment action
 * (app/[locale]/admin/appointments/actions.ts) with the lead's own
 * project/assignee pre-filled, so booking a viewing from here is a
 * shortcut into the same calendar the full /admin/appointments page
 * manages — not a second, parallel booking system.
 *
 * Listens for a `lead-composer:focus-tab` window event so the header's two
 * quick-action buttons ("Log a call" / "Schedule a viewing" —
 * LeadQuickActions.tsx) can jump straight to the right tab without a ref
 * threaded across the server/client boundary. Same cross-component-signal
 * pattern AdminSidebar's search trigger already uses to open CommandK
 * (`admin:open-search`) — reused here rather than inventing a second way
 * to do the same thing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { addLeadNote } from "@/app/[locale]/admin/(crm)/leads/actions";
import { createAppointment } from "@/app/[locale]/admin/(crm)/appointments/actions";

export type LeadComposerTab = "NOTE" | "CALL" | "EMAIL" | "APPOINTMENT";
type Tab = LeadComposerTab;

export const LEAD_COMPOSER_FOCUS_EVENT = "lead-composer:focus-tab";

type Props = {
  locale: string;
  leadId: string;
  projectId: string | null;
  assignedToId: string | null;
  labels: {
    tabNote: string;
    tabCall: string;
    tabEmail: string;
    tabAppointment: string;
    placeholderNote: string;
    placeholderCall: string;
    placeholderEmail: string;
    durationLabel: string;
    minutes: string;
    seconds: string;
    submit: string;
    error: string;
    appointmentDate: string;
    appointmentDuration: string;
    appointmentSubmit: string;
    appointmentFullLink: string;
  };
};

const NOTE_TABS: Tab[] = ["NOTE", "CALL", "EMAIL"];

export default function LeadActivityComposer({
  locale,
  leadId,
  projectId,
  assignedToId,
  labels,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("NOTE");
  const [body, setBody] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onFocusTab(event: Event) {
      const next = (event as CustomEvent<Tab>).detail;
      if (next) setTab(next);
    }
    window.addEventListener(LEAD_COMPOSER_FOCUS_EVENT, onFocusTab);
    return () => window.removeEventListener(LEAD_COMPOSER_FOCUS_EVENT, onFocusTab);
  }, []);

  const placeholder =
    tab === "CALL" ? labels.placeholderCall : tab === "EMAIL" ? labels.placeholderEmail : labels.placeholderNote;

  function submitNote(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setError(false);

    const durationSeconds =
      tab === "CALL" && (minutes || seconds)
        ? Math.max(0, Number(minutes || 0)) * 60 + Math.max(0, Number(seconds || 0))
        : undefined;

    startTransition(async () => {
      const result = await addLeadNote(locale, leadId, trimmed, tab, durationSeconds);
      if (result.ok) {
        setBody("");
        setMinutes("");
        setSeconds("");
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  function submitAppointment(event: React.FormEvent) {
    event.preventDefault();
    if (!scheduledAt) return;

    setError(false);

    startTransition(async () => {
      const result = await createAppointment(locale, {
        leadId,
        projectId: projectId ?? "",
        assignedToId: assignedToId ?? "",
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: Number(durationMinutes) || 60,
      });
      if (result.ok) {
        setScheduledAt("");
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <div id="lead-composer" className="admin-card space-y-4 scroll-mt-20">
      <div className="flex gap-1 border-b border-primary/10 pb-3">
        {([
          ["NOTE", labels.tabNote],
          ["CALL", labels.tabCall],
          ["EMAIL", labels.tabEmail],
          ["APPOINTMENT", labels.tabAppointment],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={[
              "rounded-xs px-3 py-1.5 text-xs font-medium transition-colors",
              tab === value ? "bg-primary text-white" : "text-ink-muted hover:bg-surface-muted",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {NOTE_TABS.includes(tab) ? (
        <form onSubmit={submitNote} className="space-y-3">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={pending}
            className="admin-input w-full resize-none"
          />

          {tab === "CALL" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">{labels.durationLabel}</span>
              <input
                type="number"
                min={0}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                placeholder="0"
                className="admin-input w-16 py-1.5! text-sm"
              />
              <span className="text-xs text-ink-muted">{labels.minutes}</span>
              <input
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
                placeholder="0"
                className="admin-input w-16 py-1.5! text-sm"
              />
              <span className="text-xs text-ink-muted">{labels.seconds}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || body.trim().length === 0}
              className="admin-btn px-4 py-2 text-xs"
            >
              {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {labels.submit}
            </button>
            {error && (
              <span className="flex items-center gap-1.5 text-xs text-red-700">
                <AlertCircle size={13} aria-hidden />
                {labels.error}
              </span>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={submitAppointment} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="admin-label" htmlFor="composer-appt-when">
                {labels.appointmentDate}
              </label>
              <input
                id="composer-appt-when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                disabled={pending}
                className="admin-input w-full"
              />
            </div>
            <div>
              <label className="admin-label" htmlFor="composer-appt-duration">
                {labels.appointmentDuration}
              </label>
              <input
                id="composer-appt-duration"
                type="number"
                min={15}
                step={15}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                disabled={pending}
                className="admin-input w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || !scheduledAt}
              className="admin-btn px-4 py-2 text-xs"
            >
              {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {labels.appointmentSubmit}
            </button>
            {error && (
              <span className="flex items-center gap-1.5 text-xs text-red-700">
                <AlertCircle size={13} aria-hidden />
                {labels.error}
              </span>
            )}
            <a
              href={`/${locale}/admin/appointments`}
              className="ml-auto text-xs text-accent-700 hover:text-accent-800 hover:underline"
            >
              {labels.appointmentFullLink}
            </a>
          </div>
        </form>
      )}
    </div>
  );
}
