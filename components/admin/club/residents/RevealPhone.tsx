"use client";

/**
 * A resident's phone, masked, with "ดูเบอร์". The reveal is a server call
 * that writes PHONE_REVEALED to the card's access log; the number then
 * lives in this component's state only, so a second look is a second log.
 */

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { revealResidentPhone } from "@/app/[locale]/admin/(club)/residents/actions";
import { useRunAction } from "./use-resident-action";

export default function RevealPhone({ residentId, masked }: { residentId: string; masked: string }) {
  const [value, setValue] = useState<string | null>(null);
  const { pending, run, t } = useRunAction();

  if (value) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <a href={`tel:${value.replace(/[^+0-9]/g, "")}`} className="admin-mono text-adm-info hover:underline">
          {value}
        </a>
        <span className="inline-flex items-center gap-1 text-[10.5px] text-adm-muted" title={t("phone.loggedHint")}>
          <Eye size={11} aria-hidden />
          {t("phone.logged")}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="admin-mono">{masked}</span>
      <button
        type="button"
        disabled={pending}
        title={t("phone.revealHint")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          run(() => revealResidentPhone(residentId), (result) => setValue(result.value ?? null));
        }}
        className="inline-flex items-center gap-1 rounded-full border border-adm-line-strong px-2 py-0.5 text-[10.5px] font-medium text-adm-muted transition-colors hover:border-adm-info hover:text-adm-info disabled:opacity-60"
      >
        {pending ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Eye size={11} aria-hidden />}
        {t("phone.reveal")}
      </button>
    </span>
  );
}
