/**
 * app/[locale]/admin/pages/home/gallery/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Who we are" gallery: a card per photo and the form for one in a drawer
 * (`?edit=<id>`, `?edit=new`) — the arrangement of the other Pages-hub
 * lists (CollectionGrid). Reordering is the sortOrder field on the form,
 * not drag-and-drop, matching every other list in this admin.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ImageIcon, Plus } from "lucide-react";
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
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ edit?: string }> };

export default async function AdminHomeGalleryPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;

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

  const base = `/${locale}/admin/pages/home/gallery`;
  const href = (edit: string | null) => collectionHref(base, undefined, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (photos.find((photo) => photo.id === searchParams.edit) ?? null);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("homeGallery.title")}
        description={t("homeGallery.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("homeGallery.newTitle")}
            </Link>
          ) : undefined
        }
      />

      {isDatabaseOffline() && (
        <p className="rounded-control border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <CollectionGrid
        hasImages
        items={photos.map((photo) => ({
          id: photo.id,
          href: href(photo.id),
          title: photo.label,
          imageUrl: photo.imageUrl,
          meta: `#${photo.sortOrder}`,
          visible: photo.isActive,
        }))}
        labels={{
          visible: t("homeGallery.active"),
          hidden: t("homeGallery.inactive"),
          missingThai: t("common.missingThai"),
          empty: t("homeGallery.empty"),
        }}
      />

      {target && (
        <AdminDrawer
          title={target === "new" ? t("homeGallery.newTitle") : target.label}
          icon={<ImageIcon size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
        >
          <fieldset disabled={!canWrite} className="contents">
            {target === "new" ? (
              <HomeGalleryPhotoForm action={createHomeGalleryPhoto.bind(null, locale)} submitLabel={t("common.create")} />
            ) : (
              <HomeGalleryPhotoForm
                key={target.id}
                action={updateHomeGalleryPhoto.bind(null, locale, target.id)}
                onDelete={deleteHomeGalleryPhoto.bind(null, locale, target.id)}
                values={{
                  imageUrl: target.imageUrl,
                  label: target.label,
                  isActive: target.isActive,
                  sortOrder: String(target.sortOrder),
                }}
                submitLabel={t("common.save")}
              />
            )}
          </fieldset>
        </AdminDrawer>
      )}
    </div>
  );
}
