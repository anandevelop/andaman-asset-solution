/**
 * components/admin/SectionCopyLink.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Edit this section's heading" — from a section editor (the corporate
 * cards, the why-us points) to the same section's eyebrow, heading and
 * paragraph in /admin/pages/copy, pre-searched by message key prefix.
 *
 * Those words sit directly above the cards on the site, so an editor
 * changing the cards looks for them here first; without the link the
 * answer was "a different tab, then search for it".
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Type } from "lucide-react";

type Props = {
  locale: string;
  /** Message key prefix, e.g. "home.corporate." */
  prefix: string;
  /** The editing language, carried over so the editor stays in it. */
  lang?: string;
};

export default async function SectionCopyLink({ locale, prefix, lang }: Props) {
  const t = await getTranslations({ locale, namespace: "admin.pages.copy" });
  const params = new URLSearchParams({ q: prefix, ...(lang ? { lang } : {}) });

  return (
    <Link
      href={`/${locale}/admin/pages/copy?${params.toString()}`}
      className="inline-flex items-center gap-1.5 text-sm text-adm-accent-ink underline-offset-4 hover:underline"
    >
      <Type size={14} aria-hidden />
      {t("editSectionHeading")}
    </Link>
  );
}
