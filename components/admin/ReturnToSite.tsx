"use client";

/**
 * components/admin/ReturnToSite.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "← Back to the page you were looking at", after arriving in the back
 * office from an "Edit" button on the public site.
 *
 * The buttons (components/edit/*) add `?from=/th/projects/x` to the admin
 * URL. That alone would last one screen: saving, or opening a second tab
 * of the same editor, drops the query string. So the path is kept in
 * sessionStorage — this browser tab only — until the strip is dismissed,
 * which is what an editor checking their change on the site needs.
 *
 * Only a public path is accepted: a locale prefix, no scheme, no "//"
 * and nothing under /admin. Anything else in `from` is ignored, so the
 * parameter cannot be turned into a redirect to another site.
 *
 * Read from window.location rather than useSearchParams, which in a
 * layout would need a Suspense boundary around the whole admin.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, X } from "lucide-react";
import { isReturnPath } from "@/lib/edit-mode";

const STORAGE_KEY = "andaman.returnTo";

export default function ReturnToSite() {
  const t = useTranslations("admin.returnToSite");
  const pathname = usePathname();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    let next: string | null = null;
    try {
      const from = new URLSearchParams(window.location.search).get("from");
      if (from && isReturnPath(from)) window.sessionStorage.setItem(STORAGE_KEY, from);
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      next = stored && isReturnPath(stored) ? stored : null;
    } catch {
      // Storage refused: no strip, nothing else lost.
    }
    // Synchronising with an external store (the URL and sessionStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPath(next);
  }, [pathname]);

  if (!path) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    setPath(null);
  };

  return (
    <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-adm-line bg-adm-text/4 px-3 py-2 text-sm print:hidden">
      <a href={path} className="inline-flex min-w-0 items-center gap-1.5 font-medium text-adm-accent-ink hover:underline">
        <ArrowLeft size={15} className="shrink-0" aria-hidden />
        {t("back")}
        <span className="truncate font-mono text-xs font-normal text-adm-muted">{path}</span>
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="ml-auto rounded-md p-1 text-adm-muted hover:bg-adm-text/6 hover:text-adm-text"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
