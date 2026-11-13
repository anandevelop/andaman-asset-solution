"use client";

/**
 * components/admin/agents/AgentTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The co-agent list. Five columns where there were nine, so it fits
 * without scrolling sideways: who (name over company), how to reach them
 * (masked phone with an on-demand reveal, then WhatsApp and email), the
 * registration channel, how many customers they sent, and what — if
 * anything — still needs doing (pending, duplicate, no PDPA record).
 *
 * Below `sm` the same rows are cards with 44px contact buttons; a table
 * that narrow is a row of ellipses.
 *
 * Approve / reject live on the pending card above the list
 * (PendingAgents.tsx) and in the drawer, not in a row.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, ChevronRight, Eye, Mail, MessageCircle, Phone } from "lucide-react";
import { revealAgentPhone } from "@/app/[locale]/admin/(crm)/agents/actions";
import { useFlash } from "@/components/admin/agents/Flash";
import { initialsOf } from "@/components/admin/agents/ui";

export type AgentRowData = {
  id: string;
  name: string;
  company: string | null;
  phoneMasked: string;
  hasWhatsapp: boolean;
  email: string | null;
  channel: string | null;
  pending: boolean;
  leads: number;
  duplicates: string[];
  hasNotice: boolean;
};

/** Rows drawn at first, and added by each "show more". */
const PAGE = 25;

const waHref = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export default function AgentTable({
  rows,
  editHref,
  tagMissingNotice,
}: {
  locale: string;
  rows: AgentRowData[];
  editHref: string;
  /** False when most agents have no PDPA record: then it is the normal
   *  state, and a tag on every row would only be noise (see the page). */
  tagMissingNotice: boolean;
}) {
  const t = useTranslations("coAgents.agents");
  const [flash, show] = useFlash();
  const [busy, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<Record<string, { phone: string; whatsapp: string | null }>>({});
  const [limit, setLimit] = useState(PAGE);

  const reveal = (id: string) =>
    startTransition(async () => {
      const result = await revealAgentPhone(id);
      if (result.ok) setRevealed((prev) => ({ ...prev, [id]: { phone: result.phone ?? "", whatsapp: result.whatsapp ?? null } }));
      else show(t("errGeneric"), "error");
    });

  const visible = rows.slice(0, limit);

  const avatar = (name: string, size: string) => (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-adm-neutral-bg font-semibold text-adm-neutral ${size}`}>
      {initialsOf(name)}
    </span>
  );

  const channelPill = (channel: string | null) =>
    channel ? (
      <span className="inline-block rounded-full bg-adm-fill/22 px-2.5 py-0.5 text-xs text-adm-accent-ink">{channel}</span>
    ) : (
      <span className="text-adm-muted" title={t("channelNone")}>
        —
      </span>
    );

  const missingNotice = (row: AgentRowData) => tagMissingNotice && !row.hasNotice;
  const needsAttention = (row: AgentRowData) => row.pending || row.duplicates.length > 0 || missingNotice(row);

  const statusTags = (row: AgentRowData) => {
    // "Complete" only when the PDPA record really is there.
    const clean = !needsAttention(row) && row.hasNotice;
    return (
      <span className="flex flex-wrap gap-1.5">
        {row.pending && <span className="rounded-full bg-adm-warning-bg px-2 py-0.5 text-[11.5px] font-medium text-adm-warning">{t("statusPENDING")}</span>}
        {row.duplicates.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-adm-danger-bg px-2 py-0.5 text-[11.5px] font-medium text-adm-danger"
            title={t("duplicateTitle", { names: row.duplicates.join(", ") })}
          >
            <AlertTriangle size={11} aria-hidden /> {t("duplicate")}
          </span>
        )}
        {missingNotice(row) && (
          <span className="rounded-full bg-adm-neutral-bg px-2 py-0.5 text-[11.5px] font-medium text-adm-neutral">{t("chipNoConsent")}</span>
        )}
        {clean && (
          <span className="inline-flex items-center gap-1 text-xs text-adm-success">
            <Check size={13} aria-hidden /> {t("statusComplete")}
          </span>
        )}
      </span>
    );
  };

  return (
    <>
      {flash}

      {/* ── sm and up: the table ─────────────────────────────────────── */}
      <div className="admin-card hidden overflow-x-auto p-0! sm:block">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className="admin-th pl-[22px]!">{t("colAgent")}</th>
              <th className="admin-th">{t("colContact")}</th>
              <th className="admin-th">{t("colChannelShort")}</th>
              <th className="admin-th text-right!">{t("colLeads")}</th>
              <th className="admin-th">{t("colStatus")}</th>
              <th className="admin-th w-12" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const full = revealed[row.id];
              return (
                <tr key={row.id} className="hover:bg-adm-text/[0.025]">
                  <td className="admin-td max-w-[320px] pl-[22px]!">
                    <span className="flex items-center gap-3">
                      {avatar(row.name, "size-[38px] text-[13px]")}
                      <span className="min-w-0">
                        <Link href={`${editHref}${row.id}`} scroll={false} className="block truncate font-semibold hover:underline">
                          {row.name}
                        </Link>
                        <span className="block truncate text-[12.5px] text-adm-muted">{row.company || t("noCompany")}</span>
                      </span>
                    </span>
                  </td>
                  <td className="admin-td">
                    <span className="flex items-center gap-1.5 tabular-nums">
                      {full ? (
                        full.phone ? (
                          <a href={telHref(full.phone)} className="hover:underline">
                            {full.phone}
                          </a>
                        ) : (
                          <span className="text-adm-muted">—</span>
                        )
                      ) : row.phoneMasked ? (
                        <>
                          {row.phoneMasked}
                          <button
                            type="button"
                            className="admin-btn-quiet admin-btn-sm px-1.5!"
                            onClick={() => reveal(row.id)}
                            disabled={busy}
                            aria-label={`${t("reveal")}: ${row.name}`}
                            title={t("reveal")}
                          >
                            <Eye size={14} aria-hidden />
                          </button>
                        </>
                      ) : (
                        <span className="text-adm-muted">—</span>
                      )}
                    </span>
                    <span className="flex max-w-[240px] items-center gap-1.5 text-xs text-adm-muted">
                      {full?.whatsapp ? (
                        <a href={waHref(full.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-adm-success hover:underline">
                          WhatsApp
                        </a>
                      ) : (
                        row.hasWhatsapp && <span>WhatsApp</span>
                      )}
                      {(full?.whatsapp || row.hasWhatsapp) && row.email && <span aria-hidden>·</span>}
                      {row.email && (
                        <a href={`mailto:${row.email}`} className="truncate text-adm-muted hover:text-adm-text hover:underline">
                          {row.email}
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="admin-td">{channelPill(row.channel)}</td>
                  <td className="admin-td text-right font-medium tabular-nums">{row.leads}</td>
                  <td className="admin-td whitespace-normal!">{statusTags(row)}</td>
                  <td className="admin-td text-right">
                    <Link
                      href={`${editHref}${row.id}`}
                      scroll={false}
                      aria-label={t("openDetails", { name: row.name })}
                      className="admin-btn-quiet admin-btn-sm px-1.5!"
                    >
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-td py-10 text-center text-adm-muted">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Below sm: one card per agent ─────────────────────────────── */}
      <ul className="space-y-2.5 sm:hidden">
        {visible.map((row) => {
          const full = revealed[row.id];
          return (
            <li key={row.id} className="admin-card space-y-3 p-3.5!">
              <div className="flex items-center gap-3">
                {avatar(row.name, "size-[42px] text-sm")}
                <div className="min-w-0 flex-1">
                  <Link href={`${editHref}${row.id}`} scroll={false} className="block truncate font-semibold text-adm-text">
                    {row.name}
                  </Link>
                  <p className="truncate text-[13px] text-adm-muted">{row.company || t("noCompany")}</p>
                </div>
                {row.channel && channelPill(row.channel)}
              </div>
              {needsAttention(row) && statusTags(row)}
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[13.5px] text-adm-muted">{t("sentLeads", { count: row.leads })}</span>
                <span className="flex gap-2">
                  {full ? (
                    <>
                      {full.phone && (
                        <a href={telHref(full.phone)} aria-label={`${t("call")}: ${row.name}`} className="grid size-11 place-items-center rounded-xl bg-adm-strong text-adm-on-strong">
                          <Phone size={18} aria-hidden />
                        </a>
                      )}
                      {full.whatsapp && (
                        <a
                          href={waHref(full.whatsapp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`WhatsApp: ${row.name}`}
                          className="grid size-11 place-items-center rounded-xl border border-adm-line-strong bg-adm-panel text-adm-text"
                        >
                          <MessageCircle size={18} aria-hidden />
                        </a>
                      )}
                    </>
                  ) : (
                    row.phoneMasked && (
                      <button type="button" className="admin-btn-ghost min-h-11! px-3.5!" onClick={() => reveal(row.id)} disabled={busy}>
                        <Eye size={16} aria-hidden /> {t("reveal")}
                      </button>
                    )
                  )}
                  {row.email && (
                    <a
                      href={`mailto:${row.email}`}
                      aria-label={`${t("email")}: ${row.name}`}
                      className="grid size-11 place-items-center rounded-xl border border-adm-line-strong bg-adm-panel text-adm-text"
                    >
                      <Mail size={18} aria-hidden />
                    </a>
                  )}
                </span>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="admin-card py-10 text-center text-sm text-adm-muted">{t("empty")}</li>}
      </ul>

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 px-1 text-[12.5px] text-adm-muted">
          <span>{t("shown", { shown: visible.length, total: rows.length })}</span>
          {rows.length > limit && (
            <button type="button" className="admin-btn-ghost admin-btn-sm max-sm:min-h-11!" onClick={() => setLimit((n) => n + PAGE)}>
              {t("showMore")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
