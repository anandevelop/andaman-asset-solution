/**
 * app/[locale]/admin/pages/about/milestones/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Milestones: the timeline, and the form for one stop in a drawer
 * (`?edit=<id>`, `?edit=new`) — the same arrangement as the awards page,
 * where every record's form used to sit under the list. Reordering is the
 * sortOrder field on the form, not drag-and-drop, matching every other
 * list in this admin; rows come back sorted by year first, as on the
 * public page (lib/milestones.ts).
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Flag, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { formatYear } from "@/lib/format";
import { createMilestone, deleteMilestone, updateMilestone } from "./actions";
import MilestoneForm from "@/components/admin/MilestoneForm";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import { collectionHref } from "@/components/admin/ui/CollectionGrid";

/** From this year the timeline draws stops in sand: the current run of
 *  developments. One constant, so moving the line is a one-word edit. */
const RECENT_FROM_YEAR = 2021;

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ edit?: string }> };

export default async function AdminMilestonesPage(props: Props) {
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

  const milestones = await safeQuery(
    "admin:milestones",
    () =>
      db.milestone.findMany({
        orderBy: [{ year: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    [] as Awaited<ReturnType<typeof db.milestone.findMany>>,
  );

  const base = `/${locale}/admin/pages/about/milestones`;
  const href = (edit: string | null) => collectionHref(base, undefined, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (milestones.find((milestone) => milestone.id === searchParams.edit) ?? null);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("milestones.title")}
        description={t("milestones.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("milestones.newTitle")}
            </Link>
          ) : undefined
        }
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {/* ── Timeline ────────────────────────────────────────────────
          The years as the About page tells them, left to right; from
          2021 — when the current developments began — in sand. It
          scrolls sideways inside its card, never the page. Each stop
          opens its form in the drawer. */}
      {milestones.length > 0 && (
        <section className="admin-card overflow-hidden p-0!">
          <ol className="flex gap-0 overflow-x-auto px-5 py-6">
            {[...milestones]
              .sort((a, b) => a.year - b.year || a.sortOrder - b.sortOrder)
              .map((milestone) => {
                const recent = milestone.year >= RECENT_FROM_YEAR;
                return (
                  <li key={milestone.id} className="relative min-w-[150px] flex-1 pr-4">
                    <span aria-hidden className="absolute left-0 right-0 top-[7px] h-0.5 bg-adm-line" />
                    <Link href={href(milestone.id)} scroll={false} className="group relative block">
                      <span
                        aria-hidden
                        className={[
                          "block h-4 w-4 rounded-full border-2 border-adm-solid",
                          recent ? "bg-adm-fill" : "bg-adm-info",
                          milestone.isActive ? "" : "opacity-40",
                        ].join(" ")}
                      />
                      <span className={`mt-2 block text-sm font-semibold tabular-nums ${recent ? "text-adm-accent-ink" : "text-adm-text"}`}>
                        {formatYear(milestone.year)}
                      </span>
                      <span className="block text-xs leading-snug text-adm-text group-hover:text-adm-info">
                        {milestone.projectName}
                      </span>
                      {milestone.brand && <span className="block text-[11px] text-adm-muted">{milestone.brand}</span>}
                    </Link>
                  </li>
                );
              })}
          </ol>
        </section>
      )}

      {milestones.length === 0 && (
        <div className="admin-card text-center text-sm text-adm-muted">{t("milestones.empty")}</div>
      )}

      {target && (
        <AdminDrawer
          title={target === "new" ? t("milestones.newTitle") : `${formatYear(target.year)} · ${target.projectName}`}
          icon={<Flag size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
        >
          <fieldset disabled={!canWrite} className="contents">
            {target === "new" ? (
              <MilestoneForm action={createMilestone.bind(null, locale)} submitLabel={t("common.create")} />
            ) : (
              <MilestoneForm
                key={target.id}
                action={updateMilestone.bind(null, locale, target.id)}
                onDelete={deleteMilestone.bind(null, locale, target.id)}
                values={{
                  year: String(target.year),
                  projectName: target.projectName,
                  brand: target.brand ?? "",
                  imageUrl: target.imageUrl ?? "",
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
