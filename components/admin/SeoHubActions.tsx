"use client";

/** "รายงาน" (audit CSV) and "สแกนเว็บ" (run the audit now) in the SEO hub header. */

import { useState, useTransition } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { startSeoScan } from "@/app/[locale]/admin/(growth)/seo/hub-actions";

export default function SeoHubActions({
  locale,
  labels,
}: {
  locale: string;
  labels: { report: string; scan: string; scanStarted: string; scanRunning: string; scanFailed: string };
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <a href={`/api/admin/seo/report?locale=${locale}`} className="admin-btn-ghost rounded-full! px-4">
          <Download size={14} aria-hidden />
          {labels.report}
        </a>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await startSeoScan(locale);
              setMessage(result.ok ? labels.scanStarted : result.error === "RUNNING" ? labels.scanRunning : labels.scanFailed);
            })
          }
          className="admin-btn rounded-full! px-4"
        >
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
          {labels.scan}
        </button>
      </div>
      {message && <p className="text-xs text-adm-muted">{message}</p>}
    </div>
  );
}
