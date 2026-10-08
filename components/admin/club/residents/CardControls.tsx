"use client";

/**
 * The card section's moving parts: the NONE → PRINTED → HANDED stepper
 * with its handover form, the download / print-preview / backup-code /
 * reissue buttons, and the trusted-device list.
 */

import { useActionState, useState } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, Check, Clock, Download, Printer, RefreshCw, Send, Smartphone } from "lucide-react";
import type { CardStatus } from "@prisma/client";
import {
  markCardPrinted,
  reissueResidentCard,
  sendBackupCode,
  signOutAllDevices,
  signOutDevice,
} from "@/app/[locale]/admin/(club)/residents/actions";
import { HANDOVER_METHODS } from "@/lib/club/constants";
import { formatDateShort, intlLocale } from "@/lib/format";
import AdminModal from "@/components/admin/AdminModal";
import { showUndoToast } from "@/components/admin/UndoToast";
import DownloadLink from "./DownloadLink";
import type { ResidentActionResult } from "@/app/[locale]/admin/(club)/residents/actions";
import { errorText, useRunAction, type FormAction } from "./use-resident-action";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── Stepper ───────────────────────────────────────────────────────────

export type CardState = {
  id: string;
  status: CardStatus;
  printedAt: Date | null;
  handedAt: Date | null;
  handedTo: string | null;
  handoverMethod: string | null;
  handedBy: string | null;
};

export function CardStepper({ card, ownerName, handoverAction }: { card: CardState; ownerName: string; handoverAction: FormAction }) {
  const locale = useLocale();
  const { t, run, pending } = useRunAction();
  const [open, setOpen] = useState(false);
  const [state, formAction, saving] = useActionState<ResidentActionResult | null, FormData>(async (prev, form) => {
    const result = await handoverAction(prev, form);
    if (result.ok) setOpen(false);
    return result;
  }, null);

  const step = ["NONE", "PRINTED", "HANDED"].indexOf(card.status);
  const steps = [t("card.stepIssued"), t("card.stepPrinted"), t("card.stepHanded")];
  const fd = (d: Date | null) => (d ? formatDateShort(locale, new Date(d)) : "—");
  const methodLabel = (m: string | null) => (m && t.has(`handover.methods.${m}`) ? t(`handover.methods.${m}`) : (m ?? ""));

  return (
    <div className="mt-3 rounded-[10px] border border-adm-line bg-adm-text/3 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-adm-muted">
        {steps.map((label, i) => (
          <span key={label} className="contents">
            {i > 0 && <em aria-hidden className="h-px flex-1 bg-adm-line" />}
            <span className={`flex items-center gap-1.5 whitespace-nowrap ${step >= i ? "font-semibold text-adm-success" : ""}`}>
              <i
                aria-hidden
                className={`grid h-4 w-4 place-items-center rounded-full border-[1.5px] not-italic ${step >= i ? "border-adm-success bg-adm-success text-white" : "border-adm-line-strong"}`}
              >
                {step >= i && <Check size={10} />}
              </i>
              {label}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-adm-text/80">
        {card.status === "HANDED" ? (
          <>
            <Check size={13} className="text-adm-success" aria-hidden />
            {t("card.handedInfo", { date: fd(card.handedAt), to: card.handedTo ?? "", method: methodLabel(card.handoverMethod), by: card.handedBy ?? "" })}
          </>
        ) : card.status === "PRINTED" ? (
          <>
            <Clock size={13} className="text-adm-status-info" aria-hidden />
            {t("card.printedInfo", { date: fd(card.printedAt) })}
            {!open && (
              <button type="button" onClick={() => setOpen(true)} className="admin-btn admin-btn-sm ml-1">
                <Check size={13} aria-hidden />
                {t("handover.open")}
              </button>
            )}
          </>
        ) : (
          <>
            <AlertTriangle size={13} className="text-adm-warning" aria-hidden />
            {t("card.notPrinted")}
            <button type="button" disabled={pending} onClick={() => run(() => markCardPrinted(card.id))} className="admin-btn-ghost admin-btn-sm ml-1">
              {t("card.markPrinted")}
            </button>
          </>
        )}
      </div>
      {open && (
        <form action={formAction} className="mt-2.5 grid gap-2 sm:grid-cols-3">
          <label className="sm:col-span-3">
            <span className="admin-label">{t("handover.receiver")}</span>
            <input name="handedTo" required defaultValue={ownerName} className="admin-input" />
          </label>
          <label>
            <span className="admin-label">{t("handover.date")}</span>
            <input name="handedAt" type="date" required defaultValue={todayIso()} className="admin-input" />
          </label>
          <label className="sm:col-span-2">
            <span className="admin-label">{t("handover.method")}</span>
            <select name="method" defaultValue={HANDOVER_METHODS[0]} className="admin-input">
              {HANDOVER_METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" disabled={saving} className="admin-btn admin-btn-sm">
              {t("common.save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="admin-btn-ghost admin-btn-sm">
              {t("common.cancel")}
            </button>
          </div>
          <p className="text-[11px] text-adm-muted sm:col-span-3">{t("handover.idNote")}</p>
          {state && !state.ok && <p className="rounded-md bg-adm-danger-bg px-2.5 py-1.5 text-xs text-adm-danger sm:col-span-3">{errorText(t, state.error)}</p>}
        </form>
      )}
    </div>
  );
}

// ── Buttons + print preview ──────────────────────────────────────────

export function CardActions({
  cardId,
  residentId,
  version,
  projectName,
  qrSvg,
  maskedUrl,
  canReissue,
}: {
  cardId: string;
  residentId: string;
  version: number;
  projectName: string;
  /** Inline QR markup for the print preview, rendered on the server. */
  qrSvg: string;
  maskedUrl: string;
  canReissue: boolean;
}) {
  const { t, run, pending } = useRunAction();
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const base = `/api/admin/club/qr/${cardId}`;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <DownloadLink href={`${base}?format=png`} className="admin-btn admin-btn-sm" title={t("card.pngHint")}>
          <Download size={14} aria-hidden />
          {t("card.downloadPng")}
        </DownloadLink>
        <DownloadLink href={`${base}?format=svg`} className="admin-btn-ghost admin-btn-sm" title={t("card.svgHint")}>
          <Download size={14} aria-hidden />
          SVG
        </DownloadLink>
        <button type="button" onClick={() => setPreview(true)} className="admin-btn-ghost admin-btn-sm">
          <Printer size={14} aria-hidden />
          {t("card.preview")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => sendBackupCode(residentId), (r) => showUndoToast({ message: t("card.backupSent", { email: r.value ?? "" }) }))}
          className="admin-btn-ghost admin-btn-sm"
        >
          <Send size={14} aria-hidden />
          {t("card.sendBackup")}
        </button>
        {canReissue ? (
          confirming ? (
            <span className="flex basis-full flex-wrap items-center gap-2 rounded-[10px] border border-adm-danger/35 bg-adm-danger-bg px-3 py-2 text-xs text-adm-danger">
              {t("card.reissueConfirm", { next: version + 1 })}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => reissueResidentCard(residentId), () => setConfirming(false))}
                className="admin-btn-danger admin-btn-sm ml-auto bg-adm-solid"
              >
                <RefreshCw size={13} aria-hidden />
                {t("card.reissueYes")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="admin-btn-ghost admin-btn-sm">
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="admin-btn-danger admin-btn-sm">
              <RefreshCw size={14} aria-hidden />
              {t("card.reissue")}
            </button>
          )
        ) : (
          <span className="self-center text-[11.5px] text-adm-muted">{t("card.reissueAdminOnly")}</span>
        )}
      </div>

      <AdminModal
        open={preview}
        onClose={() => setPreview(false)}
        titleId={`card-preview-${cardId}`}
        title={t("print.title", { project: projectName, version })}
        closeLabel={t("common.close")}
        className="max-w-[760px]"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <figure>
            <div className="bg-black-card relative aspect-[85.6/54] overflow-hidden rounded-[14px] p-[18px] text-[#c3c7cc] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.55)]">
              <span aria-hidden className="logo-mask bg-champagne-metal block w-[170px]" />
              <span aria-hidden className="bg-champagne-metal absolute left-[18px] top-[46%] h-7 w-[38px] rounded-md" />
              <span className="absolute bottom-[30px] left-[18px] text-[11px] tracking-[0.2em] text-[#d4d4d4]">{projectName.toUpperCase()}</span>
              <span className="absolute bottom-[14px] left-[18px] text-[9.5px] text-[#8a8a8a]">Privileges for Andaman residents</span>
            </div>
            <figcaption className="mt-2 text-center text-[11.5px] text-adm-muted">{t("print.front")}</figcaption>
          </figure>
          <figure>
            <div className="relative flex aspect-[85.6/54] items-center gap-3.5 overflow-hidden rounded-[14px] bg-[#0b0b0b] p-3.5 shadow-[0_14px_30px_-14px_rgba(0,0,0,0.55)]">
              <div className="w-[42%] shrink-0 rounded-lg bg-white p-1 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="flex min-w-0 flex-col gap-0.5 text-[10px] leading-normal text-[#d4d4d4]">
                <b className="text-xs text-[#c3c7cc]">Scan to view your privileges</b>
                <span>สแกนเพื่อดูสิทธิพิเศษของคุณ</span>
                <small className="mt-1.5 text-[8.5px] text-[#777]">
                  If found, please return to
                  <br />
                  Andaman Asset Solution
                </small>
                <i className="text-[9px] not-italic tracking-[0.15em] text-[#666]">No. {String(version).padStart(2, "0")}</i>
              </div>
            </div>
            <figcaption className="mt-2 truncate text-center text-[11.5px] text-adm-muted">
              {t("print.back")} · QR = https://{maskedUrl}
            </figcaption>
          </figure>
        </div>
        <ul className="mt-4 space-y-1 rounded-[10px] bg-adm-text/4 px-3.5 py-3 text-[12.5px] text-adm-text/80">
          {(["noOwner", "privateLink", "reissue"] as const).map((key) => (
            <li key={key} className="flex items-start gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-adm-success" aria-hidden />
              {t(`print.notes.${key}`)}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setPreview(false)} className="admin-btn-ghost">
            {t("common.close")}
          </button>
          <DownloadLink href={`${base}?format=svg`} className="admin-btn-ghost">
            <Download size={15} aria-hidden />
            QR (SVG)
          </DownloadLink>
          <DownloadLink href={`${base}?format=png`} className="admin-btn">
            <Download size={15} aria-hidden />
            {t("card.downloadPng")}
          </DownloadLink>
        </div>
      </AdminModal>
    </>
  );
}

// ── Trusted devices ─────────────────────────────────────────────────────

export type DeviceRow = { id: string; label: string; firstSeen: Date; lastSeen: Date; expiresAt: Date; member: string | null };

export function DeviceList({ residentId, devices, canManage }: { residentId: string; devices: DeviceRow[]; canManage: boolean }) {
  const locale = useLocale();
  const { t, run, pending } = useRunAction();
  const fd = (d: Date) => formatDateShort(locale, new Date(d));
  const hm = (d: Date) => new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" }).format(new Date(d));

  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-adm-text">
        {t("devices.title")} <span className="text-adm-muted">({devices.length})</span>
        {canManage && devices.length > 0 && (
          <button type="button" disabled={pending} onClick={() => run(() => signOutAllDevices(residentId))} className="admin-btn-quiet admin-btn-sm ml-auto">
            {t("devices.signOutAll")}
          </button>
        )}
      </div>
      {devices.length === 0 ? (
        <p className="py-1.5 text-xs text-adm-muted">{t("devices.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center gap-2.5 rounded-[10px] border border-adm-line px-2.5 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-adm-text/6 text-adm-muted">
                <Smartphone size={14} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-adm-text">
                  {device.label}
                  {device.member && <span className="ml-1.5 text-[11px] font-normal text-adm-muted">· {device.member}</span>}
                </p>
                <p className="truncate text-[11px] text-adm-muted">
                  {t("devices.meta", { first: fd(device.firstSeen), last: `${fd(device.lastSeen)} ${hm(device.lastSeen)}`, until: fd(device.expiresAt) })}
                </p>
              </div>
              {canManage && (
                <button type="button" disabled={pending} onClick={() => run(() => signOutDevice(device.id))} className="admin-btn-ghost admin-btn-sm">
                  {t("devices.signOut")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
