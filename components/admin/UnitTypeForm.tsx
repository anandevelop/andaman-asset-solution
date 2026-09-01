"use client";

/**
 * components/admin/UnitTypeForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One villa/unit type — specs (living area, bedrooms, bathrooms, total
 * units) plus its floor-plan photos. Doubles as the "add" form and the
 * inline editor for an existing one, same arrangement as
 * ProjectFacilityForm/AwardForm.
 *
 * `name` is NOT translated (see the schema.prisma comment on
 * ProjectUnitType.name — "Type A"/"Type R" read the same in every
 * language); only `description` is, via the same `lang`-selects-which-
 * locale's-row pattern as every other translated admin form here — the
 * page (.../unit-types/page.tsx) owns the single language selector shared
 * by every unit type's form on the page.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import FloorPlansEditor from "@/components/admin/FloorPlansEditor";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { UnitTypeFormState } from "@/app/[locale]/admin/projects/[id]/unit-types/actions";

export type UnitTypeValues = {
  name: string;
  description: string;
  livingAreaSqm: string;
  bedrooms: string;
  bathrooms: string;
  totalUnits: string;
  sortOrder: string;
  floorPlans: { id: string; floorName: string; imageUrl: string }[];
};

export const EMPTY_UNIT_TYPE: UnitTypeValues = {
  name: "",
  description: "",
  livingAreaSqm: "",
  bedrooms: "",
  bathrooms: "",
  totalUnits: "",
  sortOrder: "0",
  floorPlans: [],
};

type Props = {
  lang: Locale;
  projectSlug: string;
  action: (state: UnitTypeFormState, formData: FormData) => Promise<UnitTypeFormState>;
  onDelete?: () => Promise<void>;
  values?: UnitTypeValues;
  submitLabel: string;
};

const INITIAL: UnitTypeFormState = { ok: false };

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

export default function UnitTypeForm({
  lang,
  projectSlug,
  action,
  onDelete,
  values = EMPTY_UNIT_TYPE,
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

        <div>
          <label className="admin-label">{t("unitTypes.name")}</label>
          <input
            name="name"
            defaultValue={values.name}
            required
            placeholder={t("unitTypes.namePlaceholder")}
            className="admin-input max-w-xs"
          />
          {err("name") && <p className="mt-1.5 text-xs text-red-700">{err("name")}</p>}
        </div>

        <div>
          <label className="admin-label">{`${t("unitTypes.description")} · ${lang.toUpperCase()}`}</label>
          <textarea
            name="description"
            defaultValue={values.description}
            rows={3}
            className="admin-input"
          />
          {err("description") && <p className="mt-1.5 text-xs text-red-700">{err("description")}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="admin-label">{t("unitTypes.livingArea")}</label>
            <input
              name="livingAreaSqm"
              type="number"
              min="0"
              step="0.1"
              defaultValue={values.livingAreaSqm}
              className="admin-input"
            />
            {err("livingAreaSqm") && <p className="mt-1.5 text-xs text-red-700">{err("livingAreaSqm")}</p>}
          </div>
          <div>
            <label className="admin-label">{t("unitTypes.bedrooms")}</label>
            <input
              name="bedrooms"
              type="number"
              min="0"
              step="1"
              defaultValue={values.bedrooms}
              className="admin-input"
            />
            {err("bedrooms") && <p className="mt-1.5 text-xs text-red-700">{err("bedrooms")}</p>}
          </div>
          <div>
            <label className="admin-label">{t("unitTypes.bathrooms")}</label>
            <input
              name="bathrooms"
              type="number"
              min="0"
              step="1"
              defaultValue={values.bathrooms}
              className="admin-input"
            />
            {err("bathrooms") && <p className="mt-1.5 text-xs text-red-700">{err("bathrooms")}</p>}
          </div>
          <div>
            <label className="admin-label">{t("unitTypes.totalUnits")}</label>
            <input
              name="totalUnits"
              type="number"
              min="0"
              step="1"
              defaultValue={values.totalUnits}
              className="admin-input"
            />
            {err("totalUnits") && <p className="mt-1.5 text-xs text-red-700">{err("totalUnits")}</p>}
          </div>
        </div>

        <div>
          <label className="admin-label">{t("unitTypes.sortOrder")}</label>
          <input
            name="sortOrder"
            type="number"
            defaultValue={values.sortOrder}
            className="admin-input max-w-[10rem]"
          />
        </div>

        <div className="border-t border-primary/10 pt-5">
          <p className="admin-label">{t("unitTypes.floorPlansTitle")}</p>
          <p className="admin-hint mb-4">{t("unitTypes.floorPlansHint")}</p>

          <FloorPlansEditor
            name="floorPlans"
            slug={projectSlug}
            initialRows={values.floorPlans}
            labels={{
              floorName: t("unitTypes.floorName"),
              floorNamePlaceholder: t("unitTypes.floorNamePlaceholder"),
              image: t("unitTypes.floorImage"),
              add: t("unitTypes.addFloorPlan"),
              remove: t("common.delete"),
              empty: t("unitTypes.noFloorPlans"),
            }}
          />
        </div>

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
