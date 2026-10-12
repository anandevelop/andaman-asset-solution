"use client";

/**
 * components/admin/report/PrintToolbar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The bar above the printable analytics report: "Save as PDF", a note on
 * which option to pick in the dialog, and the way back. print:hidden, so
 * none of it reaches the PDF.
 *
 * With `autoPrint` (the Export button opens the report with ?print=1) the
 * dialog opens on its own once the fonts are in. Printing before that
 * lays the page out in the fallback face, and the PDF keeps that layout.
 * The flag is stripped from the URL first, so a reload or a shared link
 * shows the report without throwing a dialog at whoever opens it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";

type Props = {
  backHref: string;
  autoPrint: boolean;
  labels: { save: string; hint: string; back: string };
};

export default function PrintToolbar({ backHref, autoPrint, labels }: Props) {
  useEffect(() => {
    if (!autoPrint) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("print");
    window.history.replaceState(null, "", url);

    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrint]);

  return (
    <div className="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center gap-3 print:hidden">
      <Link href={backHref} className="admin-btn-ghost py-2!">
        <ArrowLeft size={14} aria-hidden />
        {labels.back}
      </Link>
      <p className="flex-1 text-xs text-adm-muted">{labels.hint}</p>
      <button type="button" onClick={() => window.print()} className="admin-btn py-2!">
        <FileDown size={15} aria-hidden />
        {labels.save}
      </button>
    </div>
  );
}
