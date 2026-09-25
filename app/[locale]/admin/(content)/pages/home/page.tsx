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
 * VIEWER may read the whole thing; reordering and hiding stay behind a
 * disabled fieldset for anyone below EDITOR, unchanged from the screen this
 * replaces. Every link is to a page carrying its own guard.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowDown, ArrowUp, ArrowUpRight, Eye, EyeOff, Lock, Sparkles } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getAllSectionRows } from "@/lib/home-sections";
import { CTA_ROW, HERO_ROW, outlineFor, type OutlineRow } from "@/lib/home-outline";
import { moveSection, setSectionVisible } from "./sections/actions";

type Props = { params: Promise<{ locale: string }> };

/** A row as rendered: the outline's description of it, plus the live
 *  HomeSection state for the nine that have one. */
type Rendered = {
  outline: OutlineRow;
  /** Null for the two fixed bands — they have no HomeSection row. */
  state: { id: string; isVisible: boolean } | null;
  /** Position among the managed rows, for the up/down buttons. */
  index: number | null;
};

export default async function AdminPagesHomePage(props: Props) {
  const { locale } = await props.params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });

  /* The live order, which is the HomeSection table's — the outline is
     joined onto it by key rather than the other way round, so a reorder
     never has to be mirrored in lib/home-outline.ts. */
  const sections = await getAllSectionRows();

  const managed: Rendered[] = sections.flatMap((row, index) => {
    const outline = outlineFor(row.key);
    // A key the outline does not describe would otherwise render a raw
    // i18n key; the test pins the two lists together so this stays dead.
    if (!outline) return [];
    return [{ outline, state: { id: row.id, isVisible: row.isVisible }, index }];
  });

  const rows: Rendered[] = [
    { outline: HERO_ROW, state: null, index: null },
    ...managed,
    { outline: CTA_ROW, state: null, index: null },
  ];

  const lastIndex = managed.length - 1;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold text-primary">{t("homeBuilder.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("homeBuilder.subtitle")}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <section className="admin-card overflow-hidden p-0!">
          <div className="border-b border-primary/10 px-5 py-4">
            <h3 className="text-sm font-semibold text-primary">{t("homeBuilder.orderTitle")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t("homeBuilder.orderHint")}</p>
          </div>

          <ol className="divide-y divide-primary/5">
            {rows.map(({ outline, state, index }) => (
              <li
                key={outline.key}
                className={`px-5 py-3.5 ${state && !state.isVisible ? "bg-surface-muted/40" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {/* Reorder controls, or the reason there are none. */}
                  <div className="flex w-7 shrink-0 flex-col items-center">
                    {state && index !== null ? (
                      <fieldset disabled={!canWrite} className="contents">
                        <form action={moveSection.bind(null, locale, state.id, "up")}>
                          <button
                            type="submit"
                            disabled={index === 0}
                            aria-label={t("homeBuilder.moveUp")}
                            className="rounded-xs p-1 text-ink-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ArrowUp size={14} aria-hidden />
                          </button>
                        </form>
                        <form action={moveSection.bind(null, locale, state.id, "down")}>
                          <button
                            type="submit"
                            disabled={index === lastIndex}
                            aria-label={t("homeBuilder.moveDown")}
                            className="rounded-xs p-1 text-ink-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ArrowDown size={14} aria-hidden />
                          </button>
                        </form>
                      </fieldset>
                    ) : (
                      /* The banner is always first and the CTA always last
                         — structural, not a permission. Saying so beats an
                         empty gap where the arrows are on every other row. */
                      <span
                        title={t("homeBuilder.fixedPosition")}
                        className="mt-1.5 text-ink-muted/40"
                      >
                        <Lock size={13} aria-hidden />
                        <span className="sr-only">{t("homeBuilder.fixedPosition")}</span>
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {t(`homeBuilder.sections.${outline.labelKey}` as never)}
                    </p>

                    {/* Who owns the content, or where it comes from. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {outline.editors.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                          <Sparkles size={12} aria-hidden className="text-accent-700" />
                          {t(`homeBuilder.auto.${outline.autoKey}` as never)}
                        </span>
                      ) : (
                        outline.editors.map((editor) => (
                          <Link
                            key={editor.href}
                            href={`/${locale}/admin${editor.href}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:text-accent-800 hover:underline"
                          >
                            {t(`homeBuilder.editor.${editor.labelKey}` as never)}
                            <ArrowUpRight size={11} aria-hidden />
                          </Link>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Visibility, for the nine that have it. */}
                  {state ? (
                    <fieldset disabled={!canWrite} className="contents">
                      <form action={setSectionVisible.bind(null, locale, state.id, !state.isVisible)}>
                        <button
                          type="submit"
                          aria-label={
                            state.isVisible ? t("homeBuilder.hideSection") : t("homeBuilder.showSection")
                          }
                          className="flex shrink-0 items-center gap-1.5 rounded-xs px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-muted"
                        >
                          {state.isVisible ? (
                            <>
                              <Eye size={15} className="text-emerald-700" aria-hidden />
                              <span className="hidden text-emerald-800 sm:inline">
                                {t("homeBuilder.visible")}
                              </span>
                            </>
                          ) : (
                            <>
                              <EyeOff size={15} aria-hidden />
                              <span className="hidden sm:inline">{t("homeBuilder.hidden")}</span>
                            </>
                          )}
                        </button>
                      </form>
                    </fieldset>
                  ) : (
                    <span className="shrink-0 px-2 py-1.5 text-xs text-ink-muted/60">
                      {t("homeBuilder.always")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="admin-card flex flex-col p-0!">
          <div className="border-b border-primary/10 px-5 py-4">
            <h3 className="text-sm font-semibold text-primary">{t("homeBuilder.previewTitle")}</h3>
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
