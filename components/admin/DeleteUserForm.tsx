"use client";

/**
 * components/admin/DeleteUserForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Confirm-then-delete for an account. Named after the person being removed
 * in the confirm dialog, because "Are you sure?" is easy to click through
 * on the wrong row.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

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
      className="admin-btn-danger"
    >
      {pending ? (
        <Loader2 size={15} className="animate-spin" aria-hidden />
      ) : (
        <Trash2 size={15} aria-hidden />
      )}
      {label}
    </button>
  );
}

export default function DeleteUserForm({ action, label, confirmLabel }: Props) {
  return (
    <form action={action}>
      <Button label={label} confirmLabel={confirmLabel} />
    </form>
  );
}
