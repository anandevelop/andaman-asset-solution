"use client";

/**
 * components/admin/CopyLinkButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "แชร์ลิงก์": copies a public page's absolute URL, for pasting into LINE
 * or an email. `path` is site-relative; the origin is the one this back
 * office is open on, which is the public site's own.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { showUndoToast } from "@/components/admin/UndoToast";

export default function CopyLinkButton({
  path,
  label,
  copiedLabel,
  className = "admin-btn admin-btn-sm",
}: {
  path: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
          setCopied(true);
          showUndoToast({ message: copiedLabel });
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* Clipboard refused (permissions, insecure origin) — nothing to undo. */
        }
      }}
    >
      {copied ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
      {label}
    </button>
  );
}
