"use client";

import { Download, Printer } from "lucide-react";

/**
 * components/PrintButtons.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Download PDF" and "Print" on the privacy-policy/terms pages both do the
 * same thing — window.print() — rather than one of them generating a real
 * PDF file server-side. Every browser's print dialog already offers "Save
 * as PDF" as a destination, so a second button gets a visitor there
 * without a PDF-rendering pipeline (and its own new dependency) existing
 * only to reproduce what the browser already does for free.
 *
 * The only reason there are two buttons at all, not one, is that a
 * visitor scanning for "how do I get a copy of this" reads "Download PDF"
 * and "Print" as two different, both-plausible answers — showing only one
 * label risks the other reading not finding it.
 *
 * A client component so the rest of the page — everything else on
 * privacy-policy/terms — can stay a Server Component; only this one
 * interaction needs the browser's window object at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

const BUTTON =
  "inline-flex items-center gap-2 rounded-xs border border-primary/15 bg-white px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-primary transition-colors hover:border-primary/30 hover:bg-surface-muted";

export default function PrintButtons({
  downloadLabel,
  printLabel,
}: {
  downloadLabel: string;
  printLabel: string;
}) {
  return (
    // print:hidden — these exist to get a visitor to the print dialog, and
    // have no reason to appear on the page that dialog produces.
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={BUTTON}>
        <Download size={14} aria-hidden /> {downloadLabel}
      </button>
      <button type="button" onClick={() => window.print()} className={BUTTON}>
        <Printer size={14} aria-hidden /> {printLabel}
      </button>
    </div>
  );
}
