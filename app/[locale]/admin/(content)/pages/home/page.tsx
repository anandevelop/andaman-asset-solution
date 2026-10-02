/**
 * app/[locale]/admin/(content)/pages/home/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The home page, top to bottom, on one screen.
 *
 * WHAT THIS REPLACED
 *
 * Four tabs. One ordered and hid the nine reorderable sections; three more
 * edited the banner, the photo strip and the closing CTA. So reordering and
 * writing were different screens — and the three writing screens were not
 * in the order list at all, which meant the list was not a picture of the
 * page: the first and last bands of the real home page were missing from
 * it. Eleven rows now, in render order, banner first and closing CTA last.
 *
 * WHY THE ROWS LINK OUT INSTEAD OF EXPANDING
 *
 * docs/ADMIN_HOME_BUILDER_PLAN.md has the reasoning; the short version is
 * that the home page is a summary page. Six of its nine reorderable
 * sections are the About or FAQ page's content shown again and three are
 * filled automatically, so a "list on the left, form on the right" screen —
 * which is what was originally sketched — would have a right-hand pane that
 * is a link for nine rows out of eleven. What was actually missing was not
 * an editor; it was a map. Each row names who owns its content and goes
 * there, and the three bands the home page genuinely owns keep their own
 * routes rather than being duplicated inline.
 *
 * A row with no editor says where its data comes from instead. Those three
 * sections could never be edited here and nothing previously explained why.
 *
 * THE V4 LAYOUT (round two)
 *
 * A drag list with switches on the left (HomeSectionList), the banner and
 * the closing CTA pinned at either end with their slide count and missing
 * languages, and the live page on the right as a desktop or a phone
 * (HomePreview) — where the up/down arrows, eye buttons and a separate
 * wireframe card used to be.
 *
 * VIEWER may read the whole thing; reordering and hiding are disabled for
 * anyone below EDITOR, as the actions require. Every link is to a page
 * carrying its own guard.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import { getAllSectionRows } from "@/lib/home-sections";
import { CTA_ROW, HERO_ROW, outlineFor, type OutlineRow } from "@/lib/home-outline";
import HomeSectionList, { type HomeListRow, type PinnedRow } from "@/components/admin/HomeSectionList";
import HomePreview from "@/components/admin/HomePreview";

type Props = { params: Promise<{ locale: string }> };

/** Languages with no text on at least one of the rows — "TH/ZH/RU". */
function missingLocales(rows: { translations: { locale: string; value: string | null }[] }[]): string[] {
  return LOCALE_DISPLAY_ORDER.filter((code) =>
    rows.some((row) => !(row.translations.find((tr) => tr.locale === code)?.value ?? "").trim()),
  ).map((code) => code.toUpperCase());
}

export default async function AdminPagesHomePage(props: Props) {
  const { locale } = await props.params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const base = `/${locale}/admin`;

  /* The live order, which is the HomeSection table's — the outline is
     joined onto it by key rather than the other way round, so a reorder
     never has to be mirrored in lib/home-outline.ts. */
  const [sections, slides, ctas] = await Promise.all([
    getAllSectionRows(),
    safeQuery(
      "admin:homeBuilder:slides",
      () =>
        prisma.heroStorySlide.findMany({
          where: { isActive: true },
          select: { durationSeconds: true, translations: { select: { locale: true, caption: true } } },
        }),
      [],
    ),
    safeQuery(
      "admin:homeBuilder:ctas",
      () =>
        prisma.siteCtaBlock.findMany({
          where: { isActive: true },
          select: { translations: { select: { locale: true, title: true } } },
        }),
      [],
    ),
  ]);

  const editorLinks = (outline: OutlineRow) =>
    outline.editors.map((editor) => ({
      href: `${base}${editor.href}`,
      label: t(`homeBuilder.editor.${editor.labelKey}` as never),
    }));

  const rows: HomeListRow[] = sections.flatMap((row) => {
    const outline = outlineFor(row.key);
    // A key the outline does not describe would otherwise render a raw
    // i18n key; the test pins the two lists together so this stays dead.
    if (!outline) return [];
    return [
      {
        id: row.id,
        code: row.key,
        label: t(`homeBuilder.sections.${outline.labelKey}` as never),
        editors: editorLinks(outline),
        autoNote: outline.editors.length === 0 ? t(`homeBuilder.auto.${outline.autoKey}` as never) : null,
        isVisible: row.isVisible,
      },
    ];
  });

  const slideMissing = missingLocales(
    slides.map((slide) => ({ translations: slide.translations.map((tr) => ({ locale: tr.locale, value: tr.caption })) })),
  );
  const ctaMissing = missingLocales(
    ctas.map((cta) => ({ translations: cta.translations.map((tr) => ({ locale: tr.locale, value: tr.title })) })),
  );
  const seconds = slides.length
    ? Math.round(slides.reduce((sum, slide) => sum + slide.durationSeconds, 0) / slides.length)
    : 0;

  const top: PinnedRow = {
    key: HERO_ROW.key,
    label: t(`homeBuilder.sections.${HERO_ROW.labelKey}` as never),
    summary: t("homeBuilder.heroSummary", { count: slides.length, seconds }),
    missing: slideMissing.length ? t("homeBuilder.missing", { list: slideMissing.join("/") }) : null,
    editHref: HERO_ROW.editors[0] ? `${base}${HERO_ROW.editors[0].href}` : null,
  };
  const bottom: PinnedRow = {
    key: CTA_ROW.key,
    label: t(`homeBuilder.sections.${CTA_ROW.labelKey}` as never),
    summary: t("homeBuilder.ctaSummary", { count: ctas.length }),
    missing: ctaMissing.length ? t("homeBuilder.missing", { list: ctaMissing.join("/") }) : null,
    editHref: CTA_ROW.editors[0] ? `${base}${CTA_ROW.editors[0].href}` : null,
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-12">
      {/* An empty list during an outage would read as "no sections". */}
      {isDatabaseOffline() && (
        <p className="rounded-control border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning xl:col-span-12">
          {t("common.offline")}
        </p>
      )}
      <div className="xl:col-span-7">
        <HomeSectionList
          locale={locale}
          top={top}
          bottom={bottom}
          rows={rows}
          canWrite={canWrite}
          labels={{
            title: t("homeBuilder.listTitle"),
            hint: t("homeBuilder.listHint"),
            drag: t("homeBuilder.drag"),
            edit: t("common.edit"),
            visible: t("homeBuilder.visible"),
            hidden: t("homeBuilder.hidden"),
            pinned: t("homeBuilder.fixedPosition"),
            saveFailed: t("common.error"),
          }}
        />
      </div>
      <div className="xl:col-span-5">
        <HomePreview
          src={`/${locale}`}
          labels={{
            title: t("homeBuilder.previewTitle"),
            hint: t("homeBuilder.previewHint"),
            device: t("homeBuilder.device"),
            desktop: t("homeBuilder.desktop"),
            phone: t("homeBuilder.phone"),
          }}
        />
      </div>
    </div>
  );
}
