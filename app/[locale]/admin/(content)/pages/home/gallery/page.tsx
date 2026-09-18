/**
 * app/[locale]/admin/pages/home/gallery/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Who we are" gallery: add at the top, every existing photo editable in
 * place — same arrangement as /admin/pages/about/milestones. Reordering is the
 * sortOrder field on each form, not drag-and-drop, matching every other
 * list in this admin.
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import {
  createHomeGalleryPhoto,
  deleteHomeGalleryPhoto,
  updateHomeGalleryPhoto,
} from "./actions";
import HomeGalleryPhotoForm from "@/components/admin/HomeGalleryPhotoForm";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminHomeGalleryPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  /* VIEWER may open this page to see what is published; only EDITOR
     and above may submit either form below (canWrite gates both with a
     disabled fieldset, matching the zone's real minimum, unchanged from
     before this phase — see the actions in ./actions.ts). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;

  const photos = await safeQuery(
    "admin:homeGalleryPhotos",
    () =>
      db.homeGalleryPhoto.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    [] as Awaited<ReturnType<typeof db.homeGalleryPhoto.findMany>>,
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("homeGallery.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("homeGallery.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── Add ─────────────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("homeGallery.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <HomeGalleryPhotoForm
            action={createHomeGalleryPhoto.bind(null, locale)}
            submitLabel={t("common.create")}
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {photos.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("homeGallery.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {photos.map((photo) => (
            <section key={photo.id} className="admin-card">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-primary">{photo.label}</h2>

                <span
                  className={
                    photo.isActive
                      ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                      : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                  }
                >
                  {photo.isActive ? t("homeGallery.active") : t("homeGallery.inactive")}
                </span>
              </div>

              <fieldset disabled={!canWrite} className="contents">
                <HomeGalleryPhotoForm
                  action={updateHomeGalleryPhoto.bind(null, locale, photo.id)}
                  onDelete={deleteHomeGalleryPhoto.bind(null, locale, photo.id)}
                  values={{
                    imageUrl: photo.imageUrl,
                    label: photo.label,
                    isActive: photo.isActive,
                    sortOrder: String(photo.sortOrder),
                  }}
                  submitLabel={t("common.save")}
                />
              </fieldset>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
