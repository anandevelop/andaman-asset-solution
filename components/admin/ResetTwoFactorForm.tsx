"use client";

/**
 * components/admin/ResetTwoFactorForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The way back in for a colleague whose phone is gone and whose recovery
 * codes went with it. Confirm-then-reset, named after the person, because
 * the row you meant is not always the row you clicked.
 *
 * A reset does not weaken the account for long: it clears the enrolment,
 * and if the role requires 2FA the gate walks them straight back through
 * setup at their next sign-in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useFormStatus } from "react-dom";
import { Loader2, ShieldOff } from "lucide-react";

type Props = {
  action: () => Promise<void>;
  label: string;
  confirmLabel: string;
};

function Button({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmLabel)) event.preventDefault();
      }}
      className="admin-btn border-red-200 text-red-700 hover:bg-red-50"
    >
      {pending ? (
        <Loader2 size={15} className="animate-spin" aria-hidden />
      ) : (
        <ShieldOff size={15} aria-hidden />
      )}
      {label}
    </button>
  );
}

export default function ResetTwoFactorForm({ action, label, confirmLabel }: Props) {
  return (
    <form action={action}>
      <Button label={label} confirmLabel={confirmLabel} />
    </form>
  );
}
