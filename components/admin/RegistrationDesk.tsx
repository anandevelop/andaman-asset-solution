"use client";

/**
 * components/admin/RegistrationDesk.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The registration list for one event (Events.dc.html), and the door mode
 * that turns it into a check-in sheet.
 *
 * CHECK-IN MODE IS A DIFFERENT SCREEN, NOT A COLUMN.
 *
 * At the door somebody is holding a phone, finding one name, and tapping
 * once. Everything the office view needs — the contact column, the lead
 * button, the registered-at timestamp — is in the way of that, so the mode
 * drops them and gives each row a single large target. The list is the
 * same list; only what it shows and what a tap does change.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, ScanLine, UserPlus, X } from "lucide-react";
import {
  createLeadFromRegistration,
  setRegistrationCheckedIn,
} from "@/app/[locale]/admin/(content)/events/actions";
import { type EventStatus } from "@prisma/client";
import RegistrationStatusSelect from "@/components/admin/RegistrationStatusSelect";

export type RegistrationView = {
  id: string;
  name: string;
  agencyName: string | null;
  email: string;
  phone: string;
  partySize: number;
  locale: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "ATTENDED" | "NO_SHOW";
  checkedIn: boolean;
  leadId: string | null;
  registeredAt: string;
};

type Props = {
  locale: string;
  eventId: string;
  rows: RegistrationView[];
  statusLabels: Record<string, string>;
  labels: {
    checkInMode: string;
    exitCheckIn: string;
    columnPerson: string;
    columnContact: string;
    columnParty: string;
    columnLanguage: string;
    columnStatus: string;
    columnLead: string;
    columnRegistered: string;
    linkedLead: string;
    notLinked: string;
    createLead: string;
    arrived: string;
    notArrived: string;
    markArrived: string;
    undoArrival: string;
    empty: string;
    error: string;
    checkInHint: string;
  };
};

export default function RegistrationDesk({
  locale,
  eventId,
  rows,
  statusLabels,
  labels,
}: Props) {
  const router = useRouter();
  const [checkInMode, setCheckInMode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggleArrival = (row: RegistrationView) => {
    setError(false);
    setBusyId(row.id);
    startTransition(async () => {
      const result = await setRegistrationCheckedIn(locale, eventId, row.id, !row.checkedIn);
      setBusyId(null);
      if (result.ok) router.refresh();
      else setError(true);
    });
  };

  const convert = (row: RegistrationView) => {
    setError(false);
    setBusyId(row.id);
    startTransition(async () => {
      const result = await createLeadFromRegistration(locale, row.id);
      setBusyId(null);
      if (result.ok) router.refresh();
      else setError(true);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setCheckInMode((value) => !value)}
          className={
            checkInMode
              ? "flex items-center gap-1.5 rounded-xs border border-primary/15 px-3 py-2 text-sm font-medium text-ink-muted hover:text-primary"
              : "flex items-center gap-1.5 rounded-xs bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          }
        >
          {checkInMode ? <X size={14} aria-hidden /> : <ScanLine size={14} aria-hidden />}
          {checkInMode ? labels.exitCheckIn : labels.checkInMode}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 rounded-xs border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={15} aria-hidden />
          {labels.error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="admin-card py-10 text-center text-sm text-ink-muted">{labels.empty}</p>
      ) : checkInMode ? (
        /* ── Door mode ─────────────────────────────────────────────── */
        <div className="space-y-2">
          <p className="rounded-xs bg-surface-muted px-4 py-2.5 text-xs text-ink-muted">
            {labels.checkInHint}
          </p>

          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => toggleArrival(row)}
              disabled={pending}
              className={[
                "flex w-full items-center gap-4 rounded-xs border px-4 py-4 text-left transition-colors disabled:opacity-60",
                row.checkedIn
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-primary/10 bg-surface-raised hover:border-primary/25",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  row.checkedIn ? "bg-emerald-600 text-white" : "border border-primary/20 text-ink-muted",
                ].join(" ")}
              >
                {busyId === row.id ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : row.checkedIn ? (
                  <Check size={18} aria-hidden />
                ) : (
                  <span className="text-sm font-semibold">{row.partySize}</span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-primary">{row.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {row.partySize > 1 && `${labels.columnParty} ${row.partySize} · `}
                  {row.phone}
                </span>
              </span>

              <span
                className={`shrink-0 text-xs font-medium ${row.checkedIn ? "text-emerald-700" : "text-ink-muted"}`}
              >
                {row.checkedIn ? labels.arrived : labels.markArrived}
              </span>
            </button>
          ))}
        </div>
      ) : (
        /* ── Office view ───────────────────────────────────────────── */
        <div className="overflow-x-auto rounded-xs border border-primary/10 bg-surface-raised shadow-card">
          <table className="w-full min-w-[980px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                <th className="admin-th">{labels.columnPerson}</th>
                <th className="admin-th">{labels.columnContact}</th>
                <th className="admin-th">{labels.columnParty}</th>
                <th className="admin-th">{labels.columnLanguage}</th>
                <th className="admin-th">{labels.columnStatus}</th>
                <th className="admin-th">{labels.columnLead}</th>
                <th className="admin-th">{labels.columnRegistered}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-surface-muted/60">
                  <td className="admin-td">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-primary">{row.name}</span>
                      {row.checkedIn && (
                        <span className="rounded-xs bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                          {labels.arrived}
                        </span>
                      )}
                    </span>
                    {row.agencyName && (
                      <span className="mt-0.5 block text-xs text-ink-muted">{row.agencyName}</span>
                    )}
                  </td>

                  <td className="admin-td text-sm">
                    <a href={`mailto:${row.email}`} className="text-accent-700 hover:underline">
                      {row.email}
                    </a>
                    <span className="text-ink-muted"> · </span>
                    <a href={`tel:${row.phone}`} className="text-ink-muted hover:text-primary">
                      {row.phone}
                    </a>
                  </td>

                  <td className="admin-td tabular-nums text-ink-muted">{row.partySize}</td>

                  <td className="admin-td">
                    {row.locale && (
                      <span className="rounded-xs bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase text-ink-muted">
                        {row.locale}
                      </span>
                    )}
                  </td>

                  <td className="admin-td">
                    <RegistrationStatusSelect
                      locale={locale}
                      eventId={eventId}
                      registrationId={row.id}
                      value={row.status}
                      labels={statusLabels as Record<EventStatus, string>}
                      errorLabel={labels.error}
                    />
                  </td>

                  <td className="admin-td text-sm">
                    {row.leadId ? (
                      <Link
                        href={`/${locale}/admin/leads/${row.leadId}`}
                        className="text-accent-700 hover:underline"
                      >
                        {labels.linkedLead}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-ink-muted/70">{labels.notLinked}</span>
                        <button
                          type="button"
                          onClick={() => convert(row)}
                          disabled={pending}
                          className="flex items-center gap-1 text-xs font-medium text-accent-700 hover:text-accent-800 disabled:opacity-50"
                        >
                          {busyId === row.id ? (
                            <Loader2 size={12} className="animate-spin" aria-hidden />
                          ) : (
                            <UserPlus size={12} aria-hidden />
                          )}
                          {labels.createLead}
                        </button>
                      </span>
                    )}
                  </td>

                  <td className="admin-td whitespace-nowrap text-xs text-ink-muted">
                    {row.registeredAt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
