"use client";

/** "ส่งออก CSV" — builds the file server-side (lib/csv.ts) and downloads it. */

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { exportAgentsCsv } from "@/app/[locale]/admin/(crm)/agents/actions";

export default function AgentExportButton({ locale }: { locale: string }) {
  const t = useTranslations("coAgents.agents");
  const [busy, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="admin-btn-ghost"
      disabled={busy}
      onClick={() =>
        startTransition(async () => {
          const result = await exportAgentsCsv(locale);
          if (!result.ok || !result.csv) return;
          const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `agents-${new Date().toISOString().slice(0, 10)}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        })
      }
    >
      {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Download size={15} aria-hidden />}
      {t("export")}
    </button>
  );
}
