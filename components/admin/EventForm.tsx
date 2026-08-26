"use client";

/**
 * components/admin/EventForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Event editor. Times use datetime-local and are read as server-local, so
 * what an editor types is what attendees see — see the note on
 * `localDateTime` in lib/validations.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { EventFormState } from "@/app/[locale]/admin/events/actions";

export type EventFormValues = {
  slug: string;
  titleEn: string;
  titleTh: string;
  descriptionEn: string;
  descriptionTh: string;
  location: string;
  startsAt: string;
  endsAt: string;
  coverImageUrl: string;
  capacity: string;
  isPublished: boolean;
};

export const EMPTY_EVENT: EventFormValues = {
  slug: "",
  titleEn: "",
  titleTh: "",
  descriptionEn: "",
  descriptionTh: "",
  location: "",
  startsAt: "",
  endsAt: "",
  coverImageUrl: "",
  capacity: "",
  isPublished: false,
};

type Props = {
  locale: string;
  action: (state: EventFormState, formData: FormData) => Promise<EventFormState>;
  values?: EventFormValues;
  onDelete?: () => Promise<void>;
  submitLabel: string;
};

const INITIAL: EventFormState = { ok: false };

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="admin-label">
        {label}
      </label>
      {children}
      {hint && !error && <p className="admin-hint">{hint}</p>}
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function DeleteButton({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmLabel)) event.preventDefault();
      }}
      className="admin-btn-danger"
    >
      <Trash2 size={15} aria-hidden />
      {label}
    </button>
  );
}

export default function EventForm({
  locale,
  action,
  values = EMPTY_EVENT,
  onDelete,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useFormState(action, INITIAL);

  const err = (name: string) => {
    const code = state.fields?.[name];
    if (!code) return null;
    if (code === "SLUG_TAKEN") return t("events.slugTaken");
    // The capacity guard returns the booked-seat count as the "error".
    if (name === "capacity" && state.message === "CAPACITY_BELOW_BOOKED") {
      return t("events.capacityBelowBooked", { booked: Number(code) });
    }
    return code;
  };

  return (
    <>
      <form action={formAction} className="space-y-8">
        {state.ok && state.message === "SAVED" && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={16} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}

        {!state.ok && state.message === "SAVE_FAILED" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={16} aria-hidden />
            {t("common.error")}
          </SaveToast>
        )}

        {/* ── Identity ──────────────────────────────────────────────── */}
        <section className="admin-card space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              name="titleEn"
              error={err("titleEn")}
              label={`${t("events.eventTitle")} · ${t("projects.english")}`}
            >
              <input
                id="titleEn"
                name="titleEn"
                defaultValue={values.titleEn}
                required
                className="admin-input"
              />
            </Field>

            <Field
              name="titleTh"
              error={err("titleTh")}
              label={`${t("events.eventTitle")} · ${t("projects.thai")}`}
            >
              <input
                id="titleTh"
                name="titleTh"
                defaultValue={values.titleTh}
                required
                className="admin-input"
              />
            </Field>
          </div>

          <Field
            name="slug"
            error={err("slug")}
            label={t("events.slug")}
            hint={t("events.slugHint")}
          >
            <input
              id="slug"
              name="slug"
              defaultValue={values.slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              className="admin-input font-mono"
            />
          </Field>

          <Field name="location" error={err("location")} label={t("events.location")}>
            <input
              id="location"
              name="location"
              defaultValue={values.location}
              className="admin-input"
            />
          </Field>
        </section>

        {/* ── Schedule ──────────────────────────────────────────────── */}
        <section className="admin-card space-y-5">
          <h2 className="admin-section-title">{t("events.schedule")}</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="startsAt" error={err("startsAt")} label={t("events.startsAt")}>
              <input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={values.startsAt}
                required
                className="admin-input"
              />
            </Field>

            <Field
              name="endsAt"
              error={err("endsAt")}
              label={t("events.endsAt")}
              hint={t("events.endsAtHint")}
            >
              <input
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                defaultValue={values.endsAt}
                className="admin-input"
              />
            </Field>
          </div>

          <Field
            name="capacity"
            error={err("capacity")}
            label={t("events.capacity")}
            hint={t("events.capacityHint")}
          >
            <input
              id="capacity"
              name="capacity"
              type="number"
              min="1"
              defaultValue={values.capacity}
              className="admin-input max-w-[160px]"
            />
          </Field>
        </section>

        {/* ── Copy ──────────────────────────────────────────────────── */}
        <section className="admin-card space-y-5">
          <h2 className="admin-section-title">{t("projects.description")}</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              name="descriptionEn"
              error={err("descriptionEn")}
              label={t("projects.english")}
            >
              <textarea
                id="descriptionEn"
                name="descriptionEn"
                defaultValue={values.descriptionEn}
                rows={6}
                className="admin-textarea"
              />
            </Field>

            <Field
              name="descriptionTh"
              error={err("descriptionTh")}
              label={t("projects.thai")}
            >
              <textarea
                id="descriptionTh"
                name="descriptionTh"
                defaultValue={values.descriptionTh}
                rows={6}
                className="admin-textarea"
              />
            </Field>
          </div>

          <ImageUploader
            name="coverImageUrl"
            prefix="events"
            slug={values.slug}
            defaultValue={values.coverImageUrl}
            label={t("events.coverImage")}
          />
        </section>

        {/* ── Publication ───────────────────────────────────────────── */}
        <section className="admin-card">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={values.isPublished}
              className="mt-0.5 h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
            />
            <span>{t("events.publish")}</span>
          </label>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={submitLabel} />

          <Link href={`/${locale}/admin/events`} className="admin-btn-ghost">
            {t("common.cancel")}
          </Link>
        </div>
      </form>

      {onDelete && (
        <form action={onDelete} className="mt-10 border-t border-primary/10 pt-6">
          <DeleteButton
            label={t("common.delete")}
            confirmLabel={t("common.confirmDelete")}
          />
          <p className="admin-hint mt-2">{t("events.deleteHint")}</p>
        </form>
      )}
    </>
  );
}
