"use client";
/**
 * components/club/CodeForm.tsx — house-code sign-in (RP-R12-8K4Q). A match
 * only starts the OTP step; the code alone never signs anyone in.
 */
import { useActionState } from "react";
import { houseCodeAction } from "@/app/[locale]/club/actions";
import type { CodeState } from "./types";
import { useOnline } from "./useOnline";
import { btnPrimary, field } from "./ui";

type Labels = { label: string; next: string; format: string; notFound: string; locked: string };

export default function CodeForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(houseCodeAction, {});
  const online = useOnline();
  const error =
    state.error === "notFound"
      ? labels.notFound.replace("{n}", String(state.left ?? 0))
      : state.error
        ? labels[state.error]
        : "";

  return (
    <form action={action} noValidate>
      <input type="hidden" name="locale" value={locale} />
      <label htmlFor="club-code" className="mb-2 block text-[12.5px] text-club-text-2">
        {labels.label}
      </label>
      <input
        id="club-code"
        name="code"
        required
        placeholder="XX-XXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby="club-code-error"
        className={`${field} text-center font-mono uppercase tracking-[0.18em]`}
      />
      <p id="club-code-error" role="alert" className="mt-2 min-h-5 text-[12.5px] text-verify-bad">
        {error}
      </p>
      <button type="submit" disabled={pending || !online} className={`${btnPrimary} mt-2`}>
        {labels.next}
      </button>
    </form>
  );
}
