"use client";

/**
 * components/admin/EBrochureForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One e-brochure. Used by both the "new" and "edit" pages, which own the
 * language selector (LanguageTabs) and pass the chosen locale down as
 * `lang` — see app/[locale]/admin/e-brochures/new/page.tsx.
 *
 * `title` and `description` are translated; the PDF, the cover, the slug
 * and the project link are not. A file has no language, and a slug is a
 * URL — translating either would mean four PDFs and four addresses for one
 * brochure, which is what a second row with its own slug is for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import SlugField from "@/components/admin/SlugField";
import type { Locale } from "@/i18n";
import type { EBrochureFormState } from "@/app/[locale]/admin/(catalog)/e-brochures/actions";

export type EBrochureValues = {
  slug: string;
  title: string;
  description: string;
  fileUrl: string;
  coverImageUrl: string;
  projectId: string;
  isPublished: boolean;
  sortOrder: string;
};

export const EMPTY_BROCHURE: EBrochureValues = {
  slug: "",
  title: "",
  description: "",
  fileUrl: "",
  coverImageUrl: "",
  projectId: "",
  isPublished: false,
  sortOrder: "0",
};

export type ProjectOption = { id: string; name: string };

type Props = {
  lang: Locale;
  action: (state: EBrochureFormState, formData: FormData) => Promise<EBrochureFormState>;
  onDelete?: () => Promise<void>;
  values?: EBrochureValues;
  projects: ProjectOption[];
  submitLabel: string;
};

const INITIAL: EBrochureFormState = { ok: false };

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

export default function EBrochureForm({
  lang,
  action,
  onDelete,
  values = EMPTY_BROCHURE,
  projects,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  const err = (name: string) => state.fields?.[name] ?? null;

  return (
    <>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={lang} />

        {state.ok && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={15} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}

        {!state.ok && state.message === "SAVE_FAILED" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {t("common.error")}
          </SaveToast>
        )}

        {err("slug") === "SLUG_TAKEN" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {t("eBrochures.slugTaken")}
          </SaveToast>
        )}

        <div>
          <label className="admin-label" htmlFor="brochure-title">
            {`${t("eBrochures.brochureTitle")} · ${lang.toUpperCase()}`}
          </label>
          <input
            id="brochure-title"
            name="title"
            defaultValue={values.title}
            required
            className="admin-input"
          />
          {err("title") && <p className="mt-1.5 text-xs text-red-700">{err("title")}</p>}
        </div>

        <div>
          <label className="admin-label" htmlFor="brochure-description">
            {`${t("eBrochures.description")} · ${lang.toUpperCase()}`}
          </label>
          <textarea
            id="brochure-description"
            name="description"
            defaultValue={values.description}
            rows={3}
            className="admin-textarea"
          />
          <p className="admin-hint">{t("eBrochures.descriptionHint")}</p>
          {err("description") && (
            <p className="mt-1.5 text-xs text-red-700">{err("description")}</p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor="brochure-slug">
              {t("eBrochures.slug")}
            </label>
            <SlugField
              id="brochure-slug"
              defaultValue={values.slug}
              required
              className="admin-input"
            />
            <p className="admin-hint">{t("eBrochures.slugHint")}</p>
            {/* SLUG_TAKEN already has its own toast above; anything else is
                a validation message worth showing against the field. */}
            {err("slug") && err("slug") !== "SLUG_TAKEN" && (
              <p className="mt-1.5 text-xs text-red-700">{err("slug")}</p>
            )}
          </div>

          <div>
            <label className="admin-label" htmlFor="brochure-sort">
              {t("eBrochures.sortOrder")}
            </label>
            <input
              id="brochure-sort"
              name="sortOrder"
              type="number"
              defaultValue={values.sortOrder}
              className="admin-input"
            />
          </div>
        </div>

        <div>
          <label className="admin-label" htmlFor="brochure-project">
            {t("eBrochures.project")}
          </label>
          {/*
            A select, not a text field. projectId is a cuid: typing one by
            hand is a guaranteed mistake, and a wrong-but-well-formed id
            would save cleanly and silently point the brochure at nothing.
          */}
          <select
            id="brochure-project"
            name="projectId"
            defaultValue={values.projectId}
            className="admin-input"
          >
            <option value="">{t("eBrochures.projectNone")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <p className="admin-hint">{t("eBrochures.projectHint")}</p>
        </div>

        <ImageUploader
          name="fileUrl"
          prefix="brochures"
          slug={values.slug}
          defaultValue={values.fileUrl}
          kind="document"
          label={t("eBrochures.file")}
          hint={t("eBrochures.fileHint")}
        />
        {err("fileUrl") && <p className="mt-1.5 text-xs text-red-700">{err("fileUrl")}</p>}

        <ImageUploader
          name="coverImageUrl"
          prefix="brochures"
          slug={values.slug}
          defaultValue={values.coverImageUrl}
          label={t("eBrochures.cover")}
          hint={t("eBrochures.coverHint")}
        />

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={values.isPublished}
            className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("common.published")}
        </label>

        <SubmitButton label={submitLabel} />
      </form>

      {/* Separate form — a nested submit would fire the save action. */}
      {onDelete && (
        <form action={onDelete} className="mt-5 border-t border-primary/10 pt-5">
          <DeleteButton
            label={t("common.delete")}
            confirmLabel={t("common.confirmDelete")}
          />
        </form>
      )}
    </>
  );
}
