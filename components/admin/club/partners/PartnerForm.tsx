"use client";

/**
 * components/admin/club/partners/PartnerForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The partner drawer (the mockup's partnerDrawer/savePartner). An ordinary
 * FormData form posting to savePartner; zod in the action is the real
 * check, the live preview here only shows what residents will read.
 * The cover uses the shared ImageUploader (direct-to-S3 + media library).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import { formatDiscount, parsePct } from "@/lib/club/benefits";
import { PARTNER_CATEGORIES } from "@/lib/club/constants";
import { deletePartner, savePartner, type PartnerFormState } from "@/app/[locale]/admin/(club)/partners/actions";
import { PctField, Switch } from "./ui";
import type { TableProject } from "./PartnerTable";

export type PartnerFormValues = {
  id: string | null;
  name: string;
  category: string;
  area: string;
  pct: string;
  note: string;
  noteEn: string;
  noteZh: string;
  noteRu: string;
  validFrom: string;
  validTo: string;
  phones: string;
  contactName: string;
  emails: string;
  website: string;
  coverImage: string;
  isActive: boolean;
  projectIds: string[];
};

const TR_FIELDS = [
  ["note_en", "noteEn", "English"],
  ["note_zh", "noteZh", "中文"],
  ["note_ru", "noteRu", "Русский"],
] as const;

export default function PartnerForm({
  locale,
  values,
  projects,
  closeHref,
  canDelete,
}: {
  locale: string;
  values: PartnerFormValues;
  projects: TableProject[];
  closeHref: string;
  canDelete: boolean;
}) {
  const t = useTranslations("clubPartners");
  const router = useRouter();
  const [state, formAction, saving] = useActionState<PartnerFormState, FormData>(
    savePartner.bind(null, locale, values.id),
    { ok: false },
  );
  const [pct, setPct] = useState(values.pct);
  const [note, setNote] = useState(values.note);
  const [active, setActive] = useState(values.isActive);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) router.replace(closeHref, { scroll: false });
  }, [state, closeHref, router]);

  const parsed = parsePct(pct);
  const preview = formatDiscount(parsed && parsed > 0 && parsed <= 100 ? parsed : null, note, "th") ?? t("form.previewEmpty");
  const err = (key: string) =>
    state.fields?.[key] ? <small className="mt-1 block text-xs text-adm-danger">{state.fields[key]}</small> : null;

  const section = "mb-6";
  const h5 = "mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-adm-muted";

  return (
    <form action={formAction} noValidate>
      <div className={section}>
        <h5 className={h5}>{t("form.cover")}</h5>
        <ImageUploader name="coverImage" prefix="partners" defaultValue={values.coverImage} label={t("form.cover")} hint={t("form.coverHint")} />
      </div>

      <div className={section}>
        <h5 className={h5}>{t("form.sectionInfo")}</h5>
        <label className="mb-3 block">
          <span className="admin-label">{t("form.name")}</span>
          <input name="name" defaultValue={values.name} required maxLength={120} className="admin-input" autoFocus />
          {err("name")}
        </label>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="admin-label">{t("form.category")}</span>
            <select name="category" defaultValue={values.category} className="admin-input">
              {PARTNER_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {t(`cat.${cat.key}` as never)}
                </option>
              ))}
            </select>
            {err("category")}
          </label>
          <label className="block">
            <span className="admin-label">{t("form.area")}</span>
            <input name="area" defaultValue={values.area} placeholder={t("form.areaPlaceholder")} maxLength={120} className="admin-input" />
          </label>
        </div>

        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr]">
          <div>
            <span className="admin-label">{t("form.pct")}</span>
            <PctField
              prefix={t("benefit.off")}
              size="lg"
              tone={pct ? "default" : "empty"}
              inputProps={{ name: "pct", value: pct, placeholder: "—", onChange: (event) => setPct(event.target.value) }}
            />
            <small className="admin-hint block">{t("form.pctHint")}</small>
            {err("pct")}
          </div>
          <label className="block">
            <span className="admin-label">{t("form.note")}</span>
            <input
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("form.notePlaceholder")}
              maxLength={80}
              className="admin-input"
            />
            <small className="admin-hint block">
              {t.rich("form.preview", { text: preview, b: (chunks) => <b>{chunks}</b> })}
            </small>
            {err("note")}
          </label>
        </div>

        <span className="admin-label mt-3">{t("form.translations")}</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TR_FIELDS.map(([name, key, label]) => (
            <label key={name} className="block">
              <span className="mb-1 block text-[11px] text-adm-muted">{label}</span>
              <input name={name} defaultValue={values[key]} placeholder={t("form.trPlaceholder")} maxLength={80} className="admin-input" />
            </label>
          ))}
        </div>
        <small className="admin-hint block">{t("form.trHint")}</small>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="admin-label">{t("form.validFrom")}</span>
            <input type="date" name="validFrom" defaultValue={values.validFrom} className="admin-input" />
            {err("validFrom")}
          </label>
          <label className="block">
            <span className="admin-label">{t("form.validTo")}</span>
            <input type="date" name="validTo" defaultValue={values.validTo} className="admin-input" />
            {err("validTo")}
          </label>
        </div>
        <small className="admin-hint block">{t("form.validHint")}</small>
      </div>

      <div className={section}>
        <h5 className={h5}>{t("form.sectionContact")}</h5>
        <label className="mb-3 block">
          <span className="admin-label">{t("form.phones")}</span>
          <textarea name="phones" rows={2} defaultValue={values.phones} placeholder="076 000 000" className="admin-input" />
          <small className="admin-hint block">{t("form.phonesHint")}</small>
          {err("phones")}
        </label>
        <label className="mb-3 block">
          <span className="admin-label">{t("form.contactName")}</span>
          <input name="contactName" defaultValue={values.contactName} placeholder={t("form.contactNamePlaceholder")} className="admin-input" />
        </label>
        <label className="mb-3 block">
          <span className="admin-label">{t("form.emails")}</span>
          <textarea name="emails" rows={2} defaultValue={values.emails} placeholder="name@example.com" className="admin-input" />
          <small className="admin-hint block">{t("form.emailsHint")}</small>
          {err("emails")}
        </label>
        <label className="block">
          <span className="admin-label">{t("form.website")}</span>
          <input name="website" defaultValue={values.website} placeholder="https://" className="admin-input" />
          {err("website")}
        </label>
      </div>

      <div className={section}>
        <h5 className={h5}>{t("form.sectionDisplay")}</h5>
        <div className="mb-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <b className="block text-sm font-medium text-adm-text">{t("form.show")}</b>
            <small className="text-[11.5px] text-adm-muted">{t("form.showHint")}</small>
          </div>
          <Switch checked={active} label={t("form.show")} onClick={() => setActive((on) => !on)} />
          {active && <input type="hidden" name="isActive" value="on" />}
        </div>
        <span className="admin-label">{t("form.projects")}</span>
        <div className="grid gap-2">
          {projects.map((project) => (
            <label key={project.id} className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-adm-line px-3 py-2.5 has-[:checked]:border-adm-fill has-[:checked]:bg-adm-fill/8">
              <input type="checkbox" name="projectIds" value={project.id} defaultChecked={values.projectIds.includes(project.id)} className="h-4 w-4" />
              <span className="min-w-0">
                <b className="block text-sm font-medium text-adm-text">
                  {project.code} · {project.name}
                </b>
                <small className="text-[11.5px] text-adm-muted">{t("form.residentsCount", { count: project.residents })}</small>
              </span>
            </label>
          ))}
          {projects.length === 0 && <small className="text-xs text-adm-warning">{t("projects.missing")}</small>}
        </div>
        <small className="admin-hint block">{t("form.projectsHint")}</small>
        {err("projectIds")}
      </div>

      {(state.message && !state.ok) || deleteError ? (
        <p role="alert" className="mb-3 rounded-[10px] bg-adm-danger-bg px-3 py-2 text-sm text-adm-danger">
          {deleteError ?? state.message}
        </p>
      ) : null}
      {state.fields && Object.keys(state.fields).length > 0 && (
        <p role="alert" className="mb-3 rounded-[10px] bg-adm-danger-bg px-3 py-2 text-sm text-adm-danger">
          {Object.values(state.fields)[0]}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-2 border-t border-adm-line bg-adm-solid px-5 py-3">
        <button type="submit" className="admin-btn" disabled={saving || deleting}>
          <Check size={15} aria-hidden />
          {saving ? t("form.saving") : t("form.save")}
        </button>
        <button type="button" className="admin-btn-ghost" onClick={() => router.replace(closeHref, { scroll: false })}>
          {t("form.cancel")}
        </button>
        {canDelete && values.id && (
          <button
            type="button"
            className="admin-btn-danger ml-auto"
            disabled={saving || deleting}
            onClick={() => {
              if (!window.confirm(t("form.deleteConfirm", { name: values.name }))) return;
              startDelete(async () => {
                const result = await deletePartner(locale, values.id as string);
                if (result.ok) router.replace(closeHref, { scroll: false });
                else setDeleteError(t("errors.generic"));
              });
            }}
          >
            <Trash2 size={14} aria-hidden />
            {t("form.delete")}
          </button>
        )}
      </div>
    </form>
  );
}
