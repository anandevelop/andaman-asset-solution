"use client";

/**
 * components/admin/NearbyEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Edits one "Nearby" list (a project's own, or the shared one) as a
 * single document: tabs with four labels, places with a distance and a
 * drive time, both reorderable. Save posts the whole list as JSON, and
 * the action replaces the stored list (see projects/nearby/actions.ts).
 *
 * For a project still showing the shared list, the editor is closed behind
 * "Make a list for this project". Opening it starts from a copy of the
 * shared list, so the first edit changes one place rather than retyping
 * twenty.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import type { NearbyFormState } from "@/app/[locale]/admin/(catalog)/projects/nearby/actions";

type Category = {
  labels: { en: string; th: string; zh: string; ru: string };
  places: { name: string; distanceKm: number; durationMin: number }[];
};

type Props = {
  action: (state: NearbyFormState, formData: FormData) => Promise<NearbyFormState>;
  /** For a project: go back to the shared list. Absent on the shared page. */
  revert?: () => Promise<NearbyFormState>;
  source: "project" | "shared" | "builtIn";
  scope: "project" | "shared";
  initial: Category[];
  canWrite: boolean;
};

const LANGS = ["th", "en", "zh", "ru"] as const;
const INITIAL: NearbyFormState = { ok: false };

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SaveButton() {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {pending ? t("saving") : t("save")}
    </button>
  );
}

export default function NearbyEditor({ action, revert, source, scope, initial, canWrite }: Props) {
  const t = useTranslations("admin.nearby");
  const tCommon = useTranslations("admin.common");
  const [state, formAction] = useActionState(action, INITIAL);
  const [categories, setCategories] = useState<Category[]>(initial);
  // A project on the shared list edits nothing until it asks for its own.
  const [editing, setEditing] = useState(scope === "shared" || source === "project");
  const [reverting, startRevert] = useTransition();

  const update = (index: number, change: (c: Category) => Category) =>
    setCategories((list) => list.map((c, i) => (i === index ? change(c) : c)));

  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-md text-adm-muted hover:bg-adm-text/5 hover:text-adm-text disabled:opacity-30";

  if (!editing) {
    return (
      <div className="admin-card space-y-3">
        <p className="text-sm text-adm-text">{t("usingShared")}</p>
        <p className="text-sm text-adm-muted">{t("usingSharedHint")}</p>
        {canWrite && (
          <button type="button" className="admin-btn" onClick={() => setEditing(true)}>
            <Plus size={15} aria-hidden />
            {t("makeOwn")}
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="payload" value={JSON.stringify(categories)} />

      {state.ok && (
        <SaveToast tone="success" token={state}>
          <CheckCircle2 size={16} aria-hidden />
          {tCommon("saved")}
        </SaveToast>
      )}
      {!state.ok && state.message && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={16} aria-hidden />
          {state.message === "INVALID" ? t("invalid", { detail: state.detail ?? "" }) : tCommon("error")}
        </SaveToast>
      )}

      {source === "builtIn" && <p className="text-sm text-adm-muted">{t("builtInNote")}</p>}

      <fieldset disabled={!canWrite} className="space-y-5">
        {categories.map((category, ci) => (
          <section key={ci} className="admin-card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-adm-text">
                {t("tab", { n: ci + 1 })} · {category.labels.th || category.labels.en || "—"}
              </h3>
              <div className="flex items-center gap-1">
                <button type="button" className={iconBtn} aria-label={t("moveUp")} disabled={ci === 0}
                  onClick={() => setCategories((l) => move(l, ci, ci - 1))}>
                  <ArrowUp size={15} aria-hidden />
                </button>
                <button type="button" className={iconBtn} aria-label={t("moveDown")} disabled={ci === categories.length - 1}
                  onClick={() => setCategories((l) => move(l, ci, ci + 1))}>
                  <ArrowDown size={15} aria-hidden />
                </button>
                <button type="button" className={`${iconBtn} hover:text-adm-danger`} aria-label={t("deleteTab")}
                  onClick={() => window.confirm(t("confirmDeleteTab")) && setCategories((l) => l.filter((_, i) => i !== ci))}>
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {LANGS.map((lang) => (
                <label key={lang} className="block">
                  <span className="admin-label">
                    {t("label")} {lang.toUpperCase()}
                    {lang === "en" && " *"}
                  </span>
                  <input
                    className="admin-input"
                    value={category.labels[lang]}
                    maxLength={60}
                    required={lang === "en"}
                    onChange={(e) => update(ci, (c) => ({ ...c, labels: { ...c.labels, [lang]: e.target.value } }))}
                  />
                </label>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="admin-th">{t("place")}</th>
                    <th className="admin-th w-28">{t("distanceKm")}</th>
                    <th className="admin-th w-28">{t("durationMin")}</th>
                    <th className="admin-th w-32" />
                  </tr>
                </thead>
                <tbody>
                  {category.places.map((place, pi) => {
                    const setPlace = (patch: Partial<Category["places"][number]>) =>
                      update(ci, (c) => ({ ...c, places: c.places.map((p, i) => (i === pi ? { ...p, ...patch } : p)) }));
                    return (
                      <tr key={pi}>
                        <td className="admin-td whitespace-normal">
                          <input className="admin-input" aria-label={t("place")} value={place.name} maxLength={120} required
                            onChange={(e) => setPlace({ name: e.target.value })} />
                        </td>
                        <td className="admin-td">
                          <input className="admin-input" aria-label={t("distanceKm")} type="number" min={0} max={999} step="0.1"
                            value={place.distanceKm} required onChange={(e) => setPlace({ distanceKm: Number(e.target.value) })} />
                        </td>
                        <td className="admin-td">
                          <input className="admin-input" aria-label={t("durationMin")} type="number" min={0} max={600} step="1"
                            value={place.durationMin} required onChange={(e) => setPlace({ durationMin: Number(e.target.value) })} />
                        </td>
                        <td className="admin-td">
                          <div className="flex justify-end gap-1">
                            <button type="button" className={iconBtn} aria-label={t("moveUp")} disabled={pi === 0}
                              onClick={() => update(ci, (c) => ({ ...c, places: move(c.places, pi, pi - 1) }))}>
                              <ArrowUp size={14} aria-hidden />
                            </button>
                            <button type="button" className={iconBtn} aria-label={t("moveDown")} disabled={pi === category.places.length - 1}
                              onClick={() => update(ci, (c) => ({ ...c, places: move(c.places, pi, pi + 1) }))}>
                              <ArrowDown size={14} aria-hidden />
                            </button>
                            <button type="button" className={`${iconBtn} hover:text-adm-danger`} aria-label={t("deletePlace")}
                              onClick={() => update(ci, (c) => ({ ...c, places: c.places.filter((_, i) => i !== pi) }))}>
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button type="button" className="admin-btn-ghost py-2!"
              onClick={() => update(ci, (c) => ({ ...c, places: [...c.places, { name: "", distanceKm: 0, durationMin: 0 }] }))}>
              <Plus size={14} aria-hidden />
              {t("addPlace")}
            </button>
          </section>
        ))}

        <button type="button" className="admin-btn-ghost"
          onClick={() => setCategories((l) => [...l, { labels: { en: "", th: "", zh: "", ru: "" }, places: [] }])}>
          <Plus size={15} aria-hidden />
          {t("addTab")}
        </button>
      </fieldset>

      {canWrite && (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3">
          {revert && source === "project" && (
            <button type="button" className="admin-btn-ghost" disabled={reverting}
              onClick={() => window.confirm(t("confirmRevert")) && startRevert(async () => {
                await revert();
                window.location.reload();
              })}>
              {t("revert")}
            </button>
          )}
          <SaveButton />
        </div>
      )}
    </form>
  );
}
