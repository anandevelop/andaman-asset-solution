"use client";

/**
 * components/admin/ClearCacheButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Fires clearSiteCache() and shows a plain "done" confirmation next to the
 * button — not a page refresh like RescanButton's siblings, since nothing
 * on this settings page changes as a result. The visible signal here has
 * to be the click's own feedback, not a difference the operator would
 * otherwise have to go and check the public site to notice.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { ClearCacheResult } from "@/app/[locale]/admin/(system)/settings/system/actions";

type Props = {
  action: () => Promise<ClearCacheResult>;
  label: string;
  successLabel: string;
  errorLabel: string;
};

export default function ClearCacheButton({ action, label, successLabel, errorLabel }: Props) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setDone(false);
            const result = await action();
            if (result.ok) {
              setDone(true);
            } else {
              window.alert(errorLabel);
            }
          })
        }
        className="admin-btn-ghost"
      >
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
        {label}
      </button>
      {done && (
        <span className="flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 size={14} aria-hidden />
          {successLabel}
        </span>
      )}
    </div>
  );
}
