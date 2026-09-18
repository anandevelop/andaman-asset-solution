/**
 * app/[locale]/admin/pages/home/sections/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Homepage section order/visibility — reorder and show/hide the 9
 * manageable homepage sections (see lib/home-sections.ts), plus a live
 * preview of the actual public homepage in an iframe (not a mockup —
 * the real route, so what an admin sees here is exactly what a visitor
 * sees once the change is saved).
 *
 * Hero slides stay on /admin/pages/home/hero (a banner rotation, not a
 * reorderable content block) and the closing "contact us" band is
 * structural chrome, not a section — neither has a row here. See the
 * file comment on HOME_SECTION_KEYS for the full reasoning.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff, MonitorPlay } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getAllSectionRows, type HomeSectionKey } from "@/lib/home-sections";
import { moveSection, setSectionVisible } from "./actions";

type Props = { params: Promise<{ locale: string }> };

const SECTION_LABEL_KEYS: Record<HomeSectionKey, string> = {
  COMPANY_INTRO: "companyIntro",
  VISION_MISSION: "visionMission",
  FEATURED_PROJECTS: "featuredProjects",
  CORPORATE: "corporate",
  AWARDS: "awards",
  WHY_US: "whyUs",
  UPCOMING_EVENT: "upcomingEvent",
  LATEST_NEWS: "latestNews",
  FAQ: "faq",
};

export default async function AdminHomeBuilderPage(props: Props) {
  const params = await props.params;

  const { locale } = params;

  /* VIEWER may open this page to see the section order; only EDITOR and
     above may reorder or hide a section (canWrite disables the whole
     reorder list below — the actions themselves are unchanged). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const rows = await getAllSectionRows();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("brand")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
            {t("homeBuilder.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("homeBuilder.subtitle")}</p>
        </div>

        <Link href={`/${locale}/admin/pages/home/hero`} className="admin-btn-ghost">
          <MonitorPlay size={15} aria-hidden />
          {t("homeBuilder.manageHeroBanner")}
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="admin-card">
          <div className="border-b border-primary/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-primary">{t("homeBuilder.orderTitle")}</h2>
            <p className="mt-1 text-xs text-ink-muted">{t("homeBuilder.orderHint")}</p>
          </div>

          <fieldset disabled={!canWrite} className="contents">
          <ol className="divide-y divide-primary/5">
            {rows.map((row, index) => (
              <li
                key={row.id}
                className={`flex items-center gap-3 px-5 py-3 ${row.isVisible ? "" : "opacity-50"}`}
              >
                <div className="flex flex-col">
                  <form action={moveSection.bind(null, locale, row.id, "up")}>
                    <button
                      type="submit"
                      disabled={index === 0}
                      aria-label={t("homeBuilder.moveUp")}
                      className="rounded-xs p-1 text-ink-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowUp size={14} aria-hidden />
                    </button>
                  </form>
                  <form action={moveSection.bind(null, locale, row.id, "down")}>
                    <button
                      type="submit"
                      disabled={index === rows.length - 1}
                      aria-label={t("homeBuilder.moveDown")}
                      className="rounded-xs p-1 text-ink-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowDown size={14} aria-hidden />
                    </button>
                  </form>
                </div>

                <span className="flex-1 text-sm font-medium text-ink">
                  {t(`homeBuilder.sections.${SECTION_LABEL_KEYS[row.key]}` as never)}
                </span>

                <span
                  className={
                    row.isVisible
                      ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                      : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                  }
                >
                  {row.isVisible ? t("homeBuilder.visible") : t("homeBuilder.hidden")}
                </span>

                <form action={setSectionVisible.bind(null, locale, row.id, !row.isVisible)}>
                  <button
                    type="submit"
                    aria-label={
                      row.isVisible ? t("homeBuilder.hideSection") : t("homeBuilder.showSection")
                    }
                    className="rounded-xs p-1.5 text-ink-muted hover:bg-surface-muted"
                  >
                    {row.isVisible ? (
                      <Eye size={16} className="text-emerald-700" aria-hidden />
                    ) : (
                      <EyeOff size={16} aria-hidden />
                    )}
                  </button>
                </form>
              </li>
            ))}
          </ol>
          </fieldset>
        </section>

        <section className="admin-card flex flex-col">
          <div className="border-b border-primary/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-primary">{t("homeBuilder.previewTitle")}</h2>
            <p className="mt-1 text-xs text-ink-muted">{t("homeBuilder.previewHint")}</p>
          </div>

          {/* The real homepage route, not a mockup — a saved reorder or
              visibility change appears here on the iframe's next load
              since every action above revalidates every locale's `/`. */}
          <iframe
            src={`/${locale}`}
            title={t("homeBuilder.previewTitle")}
            className="h-[720px] w-full flex-1 border-0"
          />
        </section>
      </div>
    </div>
  );
}
