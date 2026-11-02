"use client";

/**
 * components/admin/LeadDeleteControl.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The delete button for leads — one, from the lead drawer and page, or
 * several, from the pipeline's bulk bar — and the dialog behind it.
 *
 * Permanent, so the dialog asks for two things before the button wakes up:
 * a reason (it goes into the audit log, the name does not) and the confirm
 * word typed out. Only rendered for ADMIN and above; deleteLeads checks the
 * same on the server.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminModal from "@/components/admin/AdminModal";
import { showUndoToast } from "@/components/admin/UndoToast";
import { deleteLeads } from "@/app/[locale]/admin/(crm)/leads/actions";

const REASONS = ["test", "duplicate", "spam", "pdpaRequest", "other"] as const;
type Reason = (typeof REASONS)[number];

type Props = {
  locale: string;
  ids: string[];
  /** One lead's name, shown in the dialog; omitted for a bulk delete. */
  name?: string;
  /** Where to go once deleted — the pipeline, from a lead's own page. */
  afterHref?: string;
  onDeleted?: (deleted: string[]) => void;
  buttonClassName?: string;
};

export default function LeadDeleteControl({ locale, ids, name, afterHref, onDeleted, buttonClassName }: Props) {
  const t = useTranslations("admin.leads.delete");
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const word = t("confirmWord");
  const ready = reason !== null && typed.trim().toLowerCase() === word.toLowerCase();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setReason(null);
    setTyped("");
    setError(null);
  };

  const submit = () => {
    if (!ready || !reason) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteLeads(locale, { ids, reason });
      if (!result.ok) {
        setError(result.error === "FORBIDDEN" ? t("forbidden") : t("failed"));
        return;
      }
      const units = result.refused.filter((r) => r.reason === "UNITS").length;
      const failed = result.refused.length - units;
      if (result.deleted.length === 0) {
        setError(units ? t("refusedUnits", { count: units }) : t("failed"));
        return;
      }
      showUndoToast({
        message:
          result.refused.length > 0
            ? t("partial", { deleted: result.deleted.length, refused: result.refused.length })
            : t("done", { count: result.deleted.length }),
      });
      if (units || failed) console.warn("[leads] not deleted", result.refused);
      setOpen(false);
      onDeleted?.(result.deleted);
      if (afterHref) router.push(afterHref);
      else router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName ?? "admin-btn-ghost admin-btn-sm text-adm-danger"}
      >
        <Trash2 size={14} aria-hidden />
        {ids.length > 1 ? t("buttonMany", { count: ids.length }) : t("button")}
      </button>

      <AdminModal open={open} onClose={close} titleId={titleId} title={name ? t("titleOne", { name }) : t("titleMany", { count: ids.length })} closeLabel={t("cancel")}>
        <div className="space-y-4 text-sm">
          <p className="flex items-start gap-2 rounded-xs border border-adm-danger/30 bg-adm-danger/8 px-3 py-2.5 text-adm-danger">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            {t("warning")}
          </p>

          <fieldset>
            <legend className="admin-label">{t("reasonLabel")}</legend>
            <div className="mt-1.5 grid gap-1.5">
              {REASONS.map((value) => (
                <label key={value} className="flex cursor-pointer items-center gap-2.5 rounded-xs border border-adm-line px-3 py-2 has-[:checked]:border-adm-text/40 has-[:checked]:bg-adm-text/4">
                  <input
                    type="radio"
                    name={`${titleId}-reason`}
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                  />
                  <span className="text-adm-text">{t(`reasons.${value}`)}</span>
                </label>
              ))}
            </div>
            <p className="admin-hint mt-1.5">{t("reasonHint")}</p>
          </fieldset>

          <div>
            <label className="admin-label" htmlFor={`${titleId}-confirm`}>
              {t("typeToConfirm", { word })}
            </label>
            <input
              id={`${titleId}-confirm`}
              className="admin-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <p className="admin-hint">{t("keeps")}</p>

          {error && (
            <p role="alert" className="text-adm-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} className="admin-btn-quiet admin-btn-sm" disabled={pending}>
              {t("cancel")}
            </button>
            <button type="button" onClick={submit} disabled={!ready || pending} className="admin-btn-danger admin-btn-sm">
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}
              {t("confirm")}
            </button>
          </div>
        </div>
      </AdminModal>
    </>
  );
}
