"use client";

/**
 * components/admin/LeadExportButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Export CSV" for the leads table.
 *
 * Carries the table's current status filter through to the export, so the
 * file matches what is on screen — the alternative, always exporting
 * everything, quietly produces the wrong file for anyone who filtered
 * first.
 *
 * Date range is optional and collapsed by default. Most exports are "all of
 * it"; the range is for the month-end report.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange, Download, Loader2 } from "lucide-react";

type Props = {
  /** Status currently applied to the table, or "ALL". */
  status: string;
};

export default function LeadExportButton({ status }: Props) {
  const t = useTranslations("admin.leads.export");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const href = () => {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const query = params.toString();
    return `/api/admin/leads/export${query ? `?${query}` : ""}`;
  };

  /*
    A plain <a download> would be simpler, but it gives no feedback while
    the server builds the file and no way to surface a 403 or 429 — the
    browser just does nothing. Fetching to a blob costs a few lines and
    makes both visible.
  */
  const download = async () => {
    setBusy(true);

    try {
      const response = await fetch(href());

      if (!response.ok) {
        window.alert(response.status === 429 ? t("rateLimited") : t("failed"));
        return;
      }

      const blob = await response.blob();

      // Filename comes from Content-Disposition so the server stays the
      // single source of truth for it.
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? "leads.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Without this the blob is held until the tab closes.
      URL.revokeObjectURL(url);

      if (response.headers.get("x-export-truncated") === "true") {
        window.alert(t("truncated"));
      }
    } catch {
      window.alert(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      {open && (
        <>
          <div>
            <label htmlFor="export-from" className="admin-label">
              {t("from")}
            </label>
            <input
              id="export-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              className="admin-input"
            />
          </div>

          <div>
            <label htmlFor="export-to" className="admin-label">
              {t("to")}
            </label>
            <input
              id="export-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              className="admin-input"
            />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="admin-btn-ghost py-2!"
      >
        <CalendarRange size={14} aria-hidden />
        {open ? t("hideRange") : t("dateRange")}
      </button>

      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="admin-btn py-2!"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Download size={14} aria-hidden />
        )}
        {t("button")}
      </button>
    </div>
  );
}
