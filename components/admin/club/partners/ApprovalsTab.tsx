"use client";

/**
 * components/admin/club/partners/ApprovalsTab.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "สิทธิ์รายหลัง · รออนุมัติ" (the mockup's apprTab): pending per-house
 * requests with approve / reject (SUPER_ADMIN, never their own) and cancel
 * (the requester), then the recent decisions with outcome badges.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Clock, ShieldCheck } from "lucide-react";
import StatusPill from "@/components/admin/ui/StatusPill";
import { approveAllRequests, cancelRequest, decideRequest } from "@/app/[locale]/admin/(club)/partners/actions";
import { describeChange, type Translate } from "./change";
import { Note, fmtDate, fmtDateTime } from "./ui";
import { useFlash } from "./Flash";

export type ApprovalItem = {
  id: string;
  createdAt: string;
  unitId: string;
  house: string;
  owner: string | null;
  partnerName: string;
  defaultPct: number | null;
  from: { hidden: boolean; pct: number | null };
  to: { hidden: boolean; pct: number | null };
  requestedById: string;
  requestedByName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
};

export default function ApprovalsTab({
  locale,
  pending,
  history,
  userId,
  canApprove,
  houseHref,
}: {
  locale: string;
  pending: ApprovalItem[];
  history: ApprovalItem[];
  userId: string;
  canApprove: boolean;
  /** Prefix the unit id is appended to (the residents page's unit drawer). */
  houseHref: string;
}) {
  const t = useTranslations("clubPartners");
  const tr: Translate = (key, values) => t(key as never, values as never);
  const router = useRouter();
  const [flash, show] = useFlash();
  const [busy, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const run = (task: () => Promise<{ ok: boolean; error?: string; cap?: number; count?: number; failed?: number }>, done: (r: { count?: number; failed?: number }) => string) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        const key = `errors.${result.error ?? "generic"}`;
        show(t.has(key) ? t(key as never, { cap: result.cap ?? 0 } as never) : t("errors.generic"), "error");
        return;
      }
      setRejecting(null);
      setReason("");
      show(done(result));
      router.refresh();
    });

  const approvable = pending.filter((row) => row.requestedById !== userId).length;

  const cells = (row: ApprovalItem) => (
    <>
      <td className="admin-td tabular-nums">{fmtDateTime(row.createdAt, locale)}</td>
      <td className="admin-td">
        <Link href={`${houseHref}${row.unitId}`} className="font-mono text-[13px] font-semibold hover:underline">
          {row.house}
        </Link>
        {row.owner && <div className="text-[11.5px] text-adm-muted">{row.owner}</div>}
      </td>
      <td className="admin-td">{row.partnerName}</td>
      <td className="admin-td whitespace-normal! text-[12.5px]">{describeChange(tr, row.from, row.to, row.defaultPct)}</td>
      <td className="admin-td">{row.requestedByName}</td>
    </>
  );

  return (
    <>
      {flash}
      <div className="mb-3">
        <Note tone={canApprove ? "info" : "warning"} icon={canApprove ? <ShieldCheck size={15} /> : <Clock size={15} />}>
          {canApprove ? t("approvals.noteApprover") : t("approvals.noteRequester")}
        </Note>
      </div>

      <section className="admin-card mb-4 overflow-x-auto p-0!">
        <div className="flex items-center gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-adm-text">{t("approvals.pendingTitle", { count: pending.length })}</h2>
          {canApprove && approvable > 1 && (
            <button
              type="button"
              className="admin-btn admin-btn-sm ml-auto"
              disabled={busy}
              onClick={() =>
                run(
                  () => approveAllRequests(locale),
                  (r) =>
                    r.failed
                      ? t("approvals.approvedAllFailed", { count: r.count ?? 0, failed: r.failed })
                      : t("approvals.approvedAll", { count: r.count ?? 0 }),
                )
              }
            >
              <Check size={14} aria-hidden /> {t("approvals.approveAll")}
            </button>
          )}
        </div>
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <th className="admin-th">{t("approvals.colAt")}</th>
              <th className="admin-th">{t("approvals.colHouse")}</th>
              <th className="admin-th">{t("approvals.colPartner")}</th>
              <th className="admin-th">{t("approvals.colChange")}</th>
              <th className="admin-th">{t("approvals.colBy")}</th>
              <th className="admin-th" />
            </tr>
          </thead>
          <tbody>
            {pending.map((row) => {
              const own = row.requestedById === userId;
              return (
                <tr key={row.id}>
                  {cells(row)}
                  <td className="admin-td text-right">
                    {canApprove && !own ? (
                      rejecting === row.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder={t("approvals.reasonPlaceholder")}
                            maxLength={300}
                            className="admin-input h-7! w-48 py-0! text-xs!"
                            autoFocus
                          />
                          <button
                            type="button"
                            className="admin-btn-danger admin-btn-sm"
                            disabled={busy}
                            onClick={() => run(() => decideRequest(locale, row.id, false, reason), () => t("approvals.rejectedToast"))}
                          >
                            {t("approvals.rejectConfirm")}
                          </button>
                          <button type="button" className="admin-btn-quiet admin-btn-sm" onClick={() => setRejecting(null)}>
                            {t("approvals.back")}
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm"
                            disabled={busy}
                            onClick={() => run(() => decideRequest(locale, row.id, true), () => t("approvals.approvedToast"))}
                          >
                            <Check size={14} aria-hidden /> {t("approvals.approve")}
                          </button>
                          <button
                            type="button"
                            className="admin-btn-danger admin-btn-sm"
                            disabled={busy}
                            onClick={() => {
                              setReason("");
                              setRejecting(row.id);
                            }}
                          >
                            {t("approvals.reject")}
                          </button>
                        </span>
                      )
                    ) : own ? (
                      <span className="inline-flex items-center gap-2">
                        {canApprove && <span className="text-xs text-adm-muted">{t("approvals.own")}</span>}
                        <button
                          type="button"
                          className="admin-btn-ghost admin-btn-sm"
                          disabled={busy}
                          onClick={() => run(() => cancelRequest(locale, row.id), () => t("approvals.cancelledToast"))}
                        >
                          {t("approvals.cancel")}
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs text-adm-muted">{t("approvals.waiting")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {pending.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-td py-6 text-center text-adm-muted">
                  {t("approvals.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="admin-card overflow-x-auto p-0!">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold text-adm-text">{t("approvals.historyTitle")}</h2>
        </div>
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <th className="admin-th">{t("approvals.colAt")}</th>
              <th className="admin-th">{t("approvals.colHouse")}</th>
              <th className="admin-th">{t("approvals.colPartner")}</th>
              <th className="admin-th">{t("approvals.colChange")}</th>
              <th className="admin-th">{t("approvals.colBy")}</th>
              <th className="admin-th">{t("approvals.colOutcome")}</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => {
              const ok = row.status === "APPROVED";
              const self = ok && row.decidedById === row.requestedById;
              return (
                <tr key={row.id}>
                  {cells(row)}
                  <td className="admin-td whitespace-normal!">
                    <StatusPill
                      tone={ok ? "success" : "danger"}
                      label={ok ? (self ? t("approvals.selfEdit") : t("approvals.approved")) : t("approvals.rejected")}
                    />
                    <div className="mt-0.5 text-[11px] text-adm-muted">
                      {row.decidedByName} · {fmtDate(row.decidedAt, locale, "Asia/Bangkok")}
                      {row.reason && (
                        <>
                          <br />
                          {row.reason}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-td py-6 text-center text-adm-muted">
                  {t("approvals.historyEmpty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
