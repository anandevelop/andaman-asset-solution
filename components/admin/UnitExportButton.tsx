"use client";

/**
 * components/admin/UnitExportButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Export CSV" for the Units & Site Plan table.
 *
 * Always the whole project, regardless of which phase tab is open — the
 * phase filter on this page is a browsing tab, not a deliberate search
 * narrowing the way the leads/projects tables' filters are, and a plot
 * missing from the file because a different phase happened to be open
 * would be a confusing way to lose data nobody meant to exclude.
 *
 * Same fetch-to-blob shape as LeadExportButton: a plain <a download> gives
 * no feedback while the server builds the file and no way to surface a
 * 403/429/500, so this fetches and hands the browser a blob instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

type Props = {
  projectId: string;
  label: string;
  rateLimitedLabel: string;
  failedLabel: string;
  truncatedLabel: string;
};

export default function UnitExportButton({
  projectId,
  label,
  rateLimitedLabel,
  failedLabel,
  truncatedLabel,
}: Props) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/projects/${projectId}/units/export`);

      if (!response.ok) {
        window.alert(response.status === 429 ? rateLimitedLabel : failedLabel);
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
      link.download = match?.[1] ?? "units.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Without this the blob is held until the tab closes.
      URL.revokeObjectURL(url);

      if (response.headers.get("x-export-truncated") === "true") {
        window.alert(truncatedLabel);
      }
    } catch {
      window.alert(failedLabel);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={download} disabled={busy} className="admin-btn-ghost py-1.5! text-xs">
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />}
      {label}
    </button>
  );
}
