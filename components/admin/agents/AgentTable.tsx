"use client";

/**
 * components/admin/agents/AgentTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The co-agent table: masked phone/WhatsApp with an on-demand reveal,
 * a duplicate flag (same email or phone as another agent), channel,
 * leads count, and approve / reject for self-registrations.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Eye, Pencil, X } from "lucide-react";
import StatusPill from "@/components/admin/ui/StatusPill";
import { approveAgent, rejectAgent, revealAgentPhone } from "@/app/[locale]/admin/(crm)/agents/actions";
import { useFlash } from "@/components/admin/agents/Flash";

export type AgentRowData = {
  id: string;
  name: string;
  company: string | null;
  phoneMasked: string;
  whatsappMasked: string | null;
  email: string | null;
  channel: string | null;
  pending: boolean;
  leads: number;
  duplicates: string[];
  hasNotice: boolean;
};

const waHref = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

export default function AgentTable({ locale, rows, editHref }: { locale: string; rows: AgentRowData[]; editHref: string }) {
  const t = useTranslations("coAgents.agents");
  const router = useRouter();
  const [flash, show] = useFlash();
  const [busy, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<Record<string, { phone: string; whatsapp: string | null }>>({});

  const reveal = (id: string) =>
    startTransition(async () => {
      const result = await revealAgentPhone(id);
      if (result.ok) setRevealed((prev) => ({ ...prev, [id]: { phone: result.phone ?? "", whatsapp: result.whatsapp ?? null } }));
      else show(t("errGeneric"), "error");
    });

  const act = (task: () => Promise<{ ok: boolean }>, done: string) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        show(t("errGeneric"), "error");
        return;
      }
      show(done);
      router.refresh();
    });

  return (
    <>
      {flash}
      <div className="admin-card overflow-x-auto p-0!">
        <table className="w-full min-w-[1040px] border-collapse">
          <thead>
            <tr>
              <th className="admin-th w-10">#</th>
              <th className="admin-th">{t("colName")}</th>
              <th className="admin-th">{t("colCompany")}</th>
              <th className="admin-th">{t("colPhone")}</th>
              <th className="admin-th">{t("colWhatsapp")}</th>
              <th className="admin-th">{t("colEmail")}</th>
              <th className="admin-th">{t("colChannel")}</th>
              <th className="admin-th text-right!">{t("colLeads")}</th>
              <th className="admin-th" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const full = revealed[row.id];
              return (
                <tr key={row.id} className={row.pending ? "bg-adm-warning-bg/40" : "hover:bg-adm-text/[0.025]"}>
                  <td className="admin-td text-adm-muted tabular-nums">{index + 1}</td>
                  <td className="admin-td">
                    <span className="flex items-center gap-2">
                      <Link href={`${editHref}${row.id}`} scroll={false} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                      {row.pending && <StatusPill tone="warning" label={t("statusPENDING")} />}
                      {row.duplicates.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-adm-danger/13 px-2 py-0.5 text-[10.5px] text-adm-danger"
                          title={t("duplicateTitle", { names: row.duplicates.join(", ") })}
                        >
                          <AlertTriangle size={11} aria-hidden /> {t("duplicate")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="admin-td text-adm-muted">{row.company || "—"}</td>
                  <td className="admin-td tabular-nums">
                    {full ? (
                      full.phone ? (
                        <a href={`tel:${full.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                          {full.phone}
                        </a>
                      ) : (
                        "—"
                      )
                    ) : row.phoneMasked ? (
                      <span className="inline-flex items-center gap-1.5">
                        {row.phoneMasked}
                        <button
                          type="button"
                          className="admin-btn-quiet admin-btn-sm px-1.5!"
                          onClick={() => reveal(row.id)}
                          disabled={busy}
                          aria-label={`${t("reveal")}: ${row.name}`}
                          title={t("reveal")}
                        >
                          <Eye size={13} aria-hidden />
                        </button>
                      </span>
                    ) : (
                      <span className="text-adm-muted">—</span>
                    )}
                  </td>
                  <td className="admin-td tabular-nums">
                    {full?.whatsapp ? (
                      <a href={waHref(full.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-adm-success hover:underline">
                        {full.whatsapp}
                      </a>
                    ) : (
                      (row.whatsappMasked ?? <span className="text-adm-muted">—</span>)
                    )}
                  </td>
                  <td className="admin-td">
                    {row.email ? (
                      <a href={`mailto:${row.email}`} className="hover:underline">
                        {row.email}
                      </a>
                    ) : (
                      <span className="text-adm-muted">—</span>
                    )}
                  </td>
                  <td className="admin-td">
                    {row.channel ? (
                      <span className="rounded-full bg-adm-fill/20 px-2 py-0.5 text-[11.5px] text-adm-accent-ink">{row.channel}</span>
                    ) : (
                      <span className="text-adm-muted">—</span>
                    )}
                  </td>
                  <td className="admin-td text-right tabular-nums">{row.leads}</td>
                  <td className="admin-td text-right">
                    {row.pending ? (
                      <span className="inline-flex gap-1.5">
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm"
                          disabled={busy}
                          onClick={() => act(() => approveAgent(locale, row.id), t("approvedToast", { name: row.name }))}
                        >
                          <Check size={14} aria-hidden /> {t("approve")}
                        </button>
                        <button
                          type="button"
                          className="admin-btn-danger admin-btn-sm"
                          disabled={busy}
                          title={t("reject")}
                          aria-label={`${t("reject")}: ${row.name}`}
                          onClick={() => {
                            if (window.confirm(t("rejectConfirm", { name: row.name }))) act(() => rejectAgent(locale, row.id), t("rejectedToast"));
                          }}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    ) : (
                      <Link href={`${editHref}${row.id}`} scroll={false} className="admin-btn-ghost admin-btn-sm">
                        <Pencil size={13} aria-hidden /> {t("edit")}
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="admin-td py-10 text-center text-adm-muted">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
