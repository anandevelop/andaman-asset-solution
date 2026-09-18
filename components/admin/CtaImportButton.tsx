"use client";

/**
 * components/admin/CtaImportButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Import the current copy" — the one control in the closing-CTA empty
 * state. Creates the three blocks the site is already showing from
 * messages/*.json, in all four languages, so an editor starts from the
 * sentences visitors are reading rather than from a blank field.
 *
 * A client component only because the action's answer matters: it refuses
 * when blocks already exist, and a plain <form action> would swallow that
 * and look like it had worked.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import type { SiteCtaFormState } from "@/app/[locale]/admin/(content)/pages/home/cta/actions";

const INITIAL: SiteCtaFormState = { ok: false };

function Button({ label }: { label: string }) {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        <>
          <Download size={15} aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}

export default function CtaImportButton({
  action,
}: {
  action: (state: SiteCtaFormState) => Promise<SiteCtaFormState>;
}) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction}>
      <Button label={t("cta.importButton")} />

      {!state.ok && state.message === "NOT_EMPTY" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {t("cta.importNotEmpty")}
        </p>
      )}

      {!state.ok && state.message === "SAVE_FAILED" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {t("common.error")}
        </p>
      )}
    </form>
  );
}
