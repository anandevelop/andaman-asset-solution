"use client";

/**
 * components/admin/RescanButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Triggers a locale-scoped admin action that returns this codebase's usual
 * `{ok: true, ...} | {ok: false, error}` shape and refreshes the page on
 * success — lib/admin/link-graph.ts's ContentLink-populating scan and its
 * external-link status check, both on demand rather than a cron job, so
 * neither the keyword library's topic-cluster pick nor the Link Health
 * page is ever staler than the admin's last click.
 *
 * Formerly KeywordRescanButton, single-purpose to the keywords page's own
 * rescan action; genericized here (a type parameter on the result, rather
 * than a second near-identical component) once /admin/seo/links needed the
 * exact same button shape for a second, differently-typed action. Same
 * button + useTransition shape as this codebase's existing CSV-import
 * triggers (UnitsPanel, UrlRedirectManager), just without a file behind it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

type ActionResult = { ok: true } | { ok: false; error: string };

type Props<T extends ActionResult> = {
  action: (locale: string) => Promise<T>;
  locale: string;
  label: string;
  errorLabel: string;
};

export default function RescanButton<T extends ActionResult>({ action, locale, label, errorLabel }: Props<T>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action(locale);
          if (result.ok) {
            router.refresh();
          } else {
            // A toast would be nicer, but this action has no form context
            // to attach one to — matching how other one-off admin buttons
            // in this codebase (e.g. bulk actions) surface a failure.
            window.alert(errorLabel);
          }
        })
      }
      className="admin-btn-ghost py-1.5! text-xs"
    >
      {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RefreshCw size={13} aria-hidden />}
      {label}
    </button>
  );
}
