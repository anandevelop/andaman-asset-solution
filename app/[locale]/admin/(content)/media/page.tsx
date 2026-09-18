/**
 * app/[locale]/admin/media/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Media library — reusable uploads with alt text and usage tracking. See
 * lib/media.ts and lib/media-usage.ts for the read side, and this
 * directory's actions.ts for the mutations.
 *
 * VIEWER may open the library to see what is there — the browsing half of
 * "a photo library is exactly as sensitive as the pages that embed its
 * photos" is a read. Uploading, editing alt text and deleting stay behind
 * a disabled fieldset for anyone below EDITOR, unchanged from before this
 * phase.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { isDatabaseOffline } from "@/lib/db";
import { getMediaLibrary } from "@/lib/media";
import MediaLibrary from "@/components/admin/MediaLibrary";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminMediaPage(props: Props) {
  const { locale } = await props.params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const [t, library] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getMediaLibrary(),
  ]);

  const offline = isDatabaseOffline();

  return (
    <div className="space-y-6">
      <header>
        <p className="admin-section-title">{t("nav.media")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{t("media.title")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("media.subtitle")}</p>
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <fieldset disabled={!canWrite} className="contents">
        <MediaLibrary
          locale={locale}
          initialItems={library.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))}
          tagCounts={library.tagCounts}
          missingAltCount={library.missingAltCount}
          unusedCount={library.unusedCount}
          legacyHostCount={library.legacyHostCount}
          truncated={library.truncated}
        />
      </fieldset>
    </div>
  );
}
