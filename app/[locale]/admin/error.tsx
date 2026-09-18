"use client";

/**
 * app/[locale]/admin/error.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Error boundary for the back office.
 *
 * The user actions throw on invariant violations — deleting yourself, or
 * removing the last super admin — because those paths have no form state to
 * render into. Without a boundary here they would escape to the root and
 * take the whole app down to a blank error page. Named invariants get a
 * useful message; anything else falls back to a generic one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Action errors are thrown with a stable code as the message. */
const KNOWN: Record<string, string> = {
  CANNOT_DELETE_SELF: "users.selfLocked",
  LAST_SUPER_ADMIN: "users.lastSuperAdmin",
  UNAUTHORISED: "common.denied",
};

export default function AdminError({ error, reset }: Props) {
  const t = useTranslations("admin");

  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  /*
    next-intl is allowed here, unlike the three public boundaries, and the
    reason is the tree: NextIntlClientProvider is mounted in
    app/[locale]/layout.tsx, an *ancestor*. A failure that destroyed the
    provider would be caught above this boundary by app/[locale]/error.tsx,
    which is why that one has to stay next-intl-free and this one does not.

    What is not safe is the runtime-selected key. t() throws on a missing
    one, so a typo in KNOWN — or a renamed message — would make this
    boundary throw inside itself and escalate a handled invariant to the
    full-page crash screen. t.has() is the guard; tests/error-copy.test.ts
    pins the five keys, which tests/i18n.test.ts cannot see because they are
    never written as literals at a call site.
  */
  const key = KNOWN[error.message];
  const message = key && t.has(key as never) ? t(key as never) : t("common.error");

  return (
    <div className="admin-card flex flex-col items-center gap-4 py-14 text-center">
      <AlertTriangle size={28} strokeWidth={1.5} className="text-red-600" aria-hidden />

      <p className="max-w-md text-sm leading-relaxed text-ink">{message}</p>

      <button type="button" onClick={reset} className="admin-btn-ghost">
        <RotateCw size={15} aria-hidden />
        {t("common.back")}
      </button>
    </div>
  );
}
