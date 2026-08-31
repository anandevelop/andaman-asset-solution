"use client";

/**
 * components/admin/RecoveryCodeList.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The one and only rendering of a set of recovery codes. They are bcrypt
 * hashed the moment they are issued, so this is genuinely the last time
 * anyone can read them — the copy button and the print-friendly grid exist
 * because "write these down" is otherwise where the flow quietly fails.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound } from "lucide-react";

type Props = { codes: string[] };

export default function RecoveryCodeList({ codes }: Props) {
  const t = useTranslations("admin.security");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (insecure context, or the user said no). The codes
      // are on screen regardless, which is the part that matters.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-2">
        <KeyRound size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">
            {t("recoveryTitle")}
          </h3>
          <p className="mt-1 text-sm text-emerald-800">{t("recoveryHint")}</p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm text-emerald-950 sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="rounded-sm bg-white/70 px-3 py-2 tracking-wider">
            {code}
          </li>
        ))}
      </ul>

      <button type="button" onClick={copy} className="admin-btn mt-4">
        {copied ? (
          <>
            <Check size={15} aria-hidden />
            {t("copied")}
          </>
        ) : (
          <>
            <Copy size={15} aria-hidden />
            {t("copy")}
          </>
        )}
      </button>
    </div>
  );
}
