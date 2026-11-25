"use client";

/**
 * components/admin/PrintButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Opens the browser's print dialog, whose "Save as PDF" is how this back
 * office makes a PDF — see ReportActions in ReportControls.tsx for why
 * the server does not render one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Printer } from "lucide-react";

export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="admin-btn">
      <Printer size={15} aria-hidden />
      {label}
    </button>
  );
}
