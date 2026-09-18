"use client";

/**
 * components/admin/AppointmentCreateForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Toggleable "create appointment" panel — collapsed by default, matching
 * UrlRedirectManager's inline-form convention rather than a modal dialog.
 *
 * The lead picker is a plain <select> over the most recent leads (see
 * page.tsx's query), not a search-as-you-type autocomplete — consistent
 * with how every other assignment dropdown in this admin works
 * (LeadAssignSelect, AppointmentAssignSelect above). A future
 * improvement once the list outgrows a native select's usability.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createAppointment } from "@/app/[locale]/admin/(crm)/appointments/actions";

type Option = { id: string; label: string };

type Labels = {
  create: string;
  cancel: string;
  save: string;
  lead: string;
  noLead: string;
  project: string;
  noProject: string;
  assignedTo: string;
  unassigned: string;
  scheduledAt: string;
  duration: string;
  location: string;
  notes: string;
  error: string;
};

type Props = {
  locale: string;
  leads: Option[];
  projects: Option[];
  assignees: Option[];
  canAssignOthers: boolean;
  labels: Labels;
};

export default function AppointmentCreateForm({
  locale,
  leads,
  projects,
  assignees,
  canAssignOthers,
  labels,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    leadId: "",
    projectId: "",
    assignedToId: "",
    scheduledAt: "",
    durationMinutes: "60",
    location: "",
    notes: "",
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="admin-btn">
        <Plus size={14} aria-hidden />
        {labels.create}
      </button>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createAppointment(locale, form);
      if (result.ok) {
        setOpen(false);
        setForm({
          leadId: "",
          projectId: "",
          assignedToId: "",
          scheduledAt: "",
          durationMinutes: "60",
          location: "",
          notes: "",
        });
        router.refresh();
      } else {
        setError(labels.error);
      }
    });
  }

  return (
    <div className="admin-card w-full max-w-md space-y-3 p-4!">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">{labels.create}</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-muted hover:text-primary">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="col-span-2 block">
          <span className="admin-label">{labels.lead}</span>
          <select
            value={form.leadId}
            onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))}
            className="admin-input"
          >
            <option value="">{labels.noLead}</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="admin-label">{labels.project}</span>
          <select
            value={form.projectId}
            onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
            className="admin-input"
          >
            <option value="">{labels.noProject}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {canAssignOthers && (
          <label className="block">
            <span className="admin-label">{labels.assignedTo}</span>
            <select
              value={form.assignedToId}
              onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}
              className="admin-input"
            >
              <option value="">{labels.unassigned}</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="admin-label">{labels.scheduledAt}</span>
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
            className="admin-input"
          />
        </label>

        <label className="block">
          <span className="admin-label">{labels.duration}</span>
          <input
            type="number"
            min={15}
            step={15}
            value={form.durationMinutes}
            onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
            className="admin-input"
          />
        </label>

        <label className="col-span-2 block">
          <span className="admin-label">{labels.location}</span>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            className="admin-input"
          />
        </label>

        <label className="col-span-2 block">
          <span className="admin-label">{labels.notes}</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="admin-textarea"
            rows={2}
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="admin-btn-ghost">
          {labels.cancel}
        </button>
        <button type="button" onClick={submit} disabled={pending || !form.scheduledAt} className="admin-btn">
          {labels.save}
        </button>
      </div>
    </div>
  );
}
