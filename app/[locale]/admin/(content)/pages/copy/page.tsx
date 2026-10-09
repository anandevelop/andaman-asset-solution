/**
 * app/[locale]/admin/(content)/pages/copy/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ข้อความบนเว็บ" — every heading, label and paragraph the public site
 * prints from messages/*.json, all four languages side by side.
 *
 * WHY FOUR COLUMNS, NOT A LANGUAGE TAB
 *
 * The first version edited one language at a time and showed the built-in
 * copy as a grey placeholder. Editors read the grey text as an empty box,
 * could not see the translation they were changing the Thai against, and
 * had to clear a box to "go back". Now every cell holds the text the site
 * actually shows, a small status says whether that is the default or an
 * edit, and "Use default" is one click. A row whose Thai was edited while
 * another language still has its built-in text is flagged for review —
 * the Thai is the source the other three are translated from.
 *
 * WHERE THINGS ARE
 *
 * The sidebar groups the message namespaces by the page a visitor meets
 * them on (lib/site-copy-meta.ts). Inside a namespace, rows are grouped by
 * the key's second segment, titled with that block's own heading where it
 * has one ("home.corporate.title" titles the "corporate" block). Search
 * (?q=) runs over every namespace and every language, by the words as
 * they read on the site. ?key= opens the key's namespace with that row
 * highlighted — where the picker on the public site sends "open in the
 * back office".
 *
 * EDITOR and up may save; VIEWER sees the grid disabled.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ExternalLink, MousePointerClick, Search } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { locales, type Locale } from "@/i18n";
import {
  isContentNamespace,
  isEditableKey,
  isEditableNamespace,
  placeholdersOf,
  type EditableNamespace,
} from "@/lib/site-copy-core";
import {
  COPY_NAMESPACE_PATH,
  COPY_PAGE_GROUPS,
  copyBlockTitle,
  copyKind,
  copySubgroup,
  humanizeSegment,
} from "@/lib/site-copy-meta";
import { allCopyDefaults } from "@/lib/site-copy-content";
import { icuSkeleton } from "@/lib/icu-skeleton";
import { getCopyOverridesForEditing, getCopyReviews } from "@/lib/site-copy";
import { markCopyReviewed, updateSiteCopy } from "./actions";
import SiteCopyForm, { type SiteCopyGroup, type SiteCopyRow } from "@/components/admin/SiteCopyForm";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ns?: string; q?: string; show?: string; key?: string }>;
};

/** A search over all ~1,000 strings can match most of them ("a"). */
const MAX_SEARCH_ROWS = 120;

/** Thai first: it is the source the other three are translated from. */
const COLUMN_ORDER: Locale[] = ["th", "en", "zh", "ru"];

type Show = "all" | "edited" | "review";

export default async function AdminSiteCopy(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const query = (searchParams.q ?? "").trim();
  const needle = query.toLocaleLowerCase();
  const focusKey = searchParams.key && isEditableKey(searchParams.key) ? searchParams.key : null;
  const ns: EditableNamespace = focusKey
    ? (focusKey.split(".", 1)[0] as EditableNamespace)
    : searchParams.ns && isEditableNamespace(searchParams.ns)
      ? searchParams.ns
      : "home";
  const show: Show = searchParams.show === "edited" || searchParams.show === "review" ? searchParams.show : "all";

  const [t, defaultsList, overridesList, reviewsList] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    Promise.all(locales.map((l) => allCopyDefaults(l))),
    Promise.all(locales.map((l) => getCopyOverridesForEditing(l))),
    Promise.all(locales.map((l) => getCopyReviews(l))),
  ]);
  const reviews = Object.fromEntries(locales.map((l, i) => [l, reviewsList[i]])) as Record<
    Locale,
    Record<string, Date>
  >;
  const defaults = Object.fromEntries(locales.map((l, i) => [l, defaultsList[i]])) as Record<
    Locale,
    Record<string, string>
  >;
  const overrides = Object.fromEntries(locales.map((l, i) => [l, overridesList[i]])) as Record<
    Locale,
    Awaited<ReturnType<typeof getCopyOverridesForEditing>>
  >;

  // Titles and chips read in the back office's own language.
  const uiLang: Locale = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "th";
  const allKeys = Object.keys(defaults.th);

  const isEdited = (key: string) => COLUMN_ORDER.some((l) => key in overrides[l] && key in defaults[l]);
  /** Languages that may lag behind an edited Thai. */
  const staleLocales = (key: string): Locale[] => {
    const th = overrides.th[key];
    if (!th) return [];
    return COLUMN_ORDER.filter((l) => l !== "th").filter((l) => {
      // The later of the language's own edit and an explicit "checked"
      // mark (markCopyReviewed) — either says someone looked after Thai.
      const touched = Math.max(overrides[l][key]?.updatedAt.getTime() ?? 0, reviews[l][key]?.getTime() ?? 0);
      return touched < th.updatedAt.getTime();
    });
  };

  const changedPer = (name: string) => allKeys.filter((key) => key.startsWith(`${name}.`) && isEdited(key)).length;

  const inScope = allKeys.filter((key) =>
    needle
      ? key.toLocaleLowerCase().includes(needle) ||
        COLUMN_ORDER.some(
          (l) =>
            (defaults[l][key] ?? "").toLocaleLowerCase().includes(needle) ||
            (overrides[l][key]?.value.toLocaleLowerCase().includes(needle) ?? false),
        )
      : key.startsWith(`${ns}.`),
  );
  const counts = {
    all: inScope.length,
    edited: inScope.filter(isEdited).length,
    review: inScope.filter((key) => staleLocales(key).length > 0).length,
  };
  const filtered = inScope.filter((key) =>
    show === "edited" ? isEdited(key) : show === "review" ? staleLocales(key).length > 0 : true,
  );
  const shown = filtered.slice(0, needle ? MAX_SEARCH_ROWS : undefined);

  const toRow = (key: string): SiteCopyRow => {
    const icu = !isContentNamespace(key.split(".", 1)[0]);
    const stale = staleLocales(key);
    return {
      key,
      kind: copyKind(key, defaults[uiLang][key] ?? defaults.th[key]),
      icu,
      ...(icu ? placeholdersOf(defaults.en[key] ?? defaults.th[key]) : { args: [], tags: [] }),
      counted: icu && icuSkeleton(defaults.th[key] ?? "") !== null,
      cells: COLUMN_ORDER.map((l) => ({
        locale: l,
        fallback: defaults[l][key] ?? "",
        saved: overrides[l][key]?.value ?? null,
        stale: stale.includes(l),
      })),
    };
  };

  // Group: by namespace when searching, by block inside one namespace.
  const groups: SiteCopyGroup[] = [];
  const groupOf = new Map<string, SiteCopyGroup>();
  for (const key of shown) {
    const name = key.split(".", 1)[0];
    const segment = copySubgroup(key);
    const id = needle ? name : segment;
    let group = groupOf.get(id);
    if (!group) {
      let title: string;
      if (needle) title = t(`pages.copy.ns.${name}` as never);
      else if (!segment) title = t("pages.copy.general");
      else title = copyBlockTitle(key, defaults[uiLang]) ?? humanizeSegment(segment);
      group = { id, title, rows: [] };
      groupOf.set(id, group);
      groups.push(group);
    }
    group.rows.push(toRow(key));
  }

  const hrefFor = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;
  const base: Record<string, string> = needle ? { q: query } : { ns };
  const sitePath = COPY_NAMESPACE_PATH[ns];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-adm-text">{t("pages.copy.heading")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-adm-muted">{t("pages.copy.intro")}</p>
        </div>
        <p className="flex max-w-sm items-start gap-2 rounded-xs border border-adm-line bg-adm-text/4 px-3 py-2 text-xs text-adm-muted">
          <MousePointerClick size={15} className="mt-px shrink-0 text-adm-accent-ink" aria-hidden />
          {t("pages.copy.pickTip")}
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <nav
          aria-label={t("pages.copy.sections")}
          className="flex w-full flex-col gap-4 lg:sticky lg:top-4 lg:w-52 lg:shrink-0"
        >
          {COPY_PAGE_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-0.5">
              <p className="px-2.5 pb-1 text-xs text-adm-muted">{t(`pages.copy.groups.${group.id}`)}</p>
              {group.namespaces.map((name) => {
                const active = !needle && name === ns;
                const changed = changedPer(name);
                return (
                  <Link
                    key={name}
                    href={hrefFor({ ns: name })}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-xs px-2.5 py-1.5 text-sm ${
                      active ? "bg-adm-band text-adm-on-strong" : "text-adm-text hover:bg-adm-text/5"
                    }`}
                  >
                    <span>{t(`pages.copy.ns.${name}`)}</span>
                    {changed > 0 && (
                      <span
                        className={`flex items-center gap-1.5 text-xs tabular-nums ${active ? "opacity-80" : "text-adm-muted"}`}
                        title={t("pages.copy.changedCount", { count: changed })}
                      >
                        <span className="size-1.5 rounded-full bg-adm-fill" aria-hidden />
                        {changed}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-[999_1_640px] space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* GET, so a search is a URL — section editors link straight to theirs. */}
            <form method="get" className="flex min-w-0 flex-[1_1_320px] gap-2">
              <label htmlFor="copy-search" className="sr-only">
                {t("pages.copy.searchLabel")}
              </label>
              <input
                id="copy-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder={t("pages.copy.searchPlaceholder")}
                className="admin-input"
              />
              <button type="submit" className="admin-btn-ghost shrink-0">
                <Search size={15} aria-hidden />
                {t("common.search")}
              </button>
            </form>

            <div
              role="group"
              aria-label={t("pages.copy.filter.label")}
              className="flex gap-1 rounded-[10px] bg-adm-text/6 p-1"
            >
              {(["all", "edited", "review"] as const).map((id) => (
                <Link
                  key={id}
                  href={hrefFor(id === "all" ? base : { ...base, show: id })}
                  aria-current={show === id ? "true" : undefined}
                  className={`rounded-[8px] px-3 py-1.5 text-sm ${
                    show === id ? "bg-adm-panel text-adm-text shadow-sm" : "text-adm-muted hover:text-adm-text"
                  }`}
                >
                  {t(`pages.copy.filter.${id}`)} <span className="tabular-nums opacity-70">{counts[id]}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            {needle ? (
              <p className="text-sm text-adm-muted">
                {t("pages.copy.results", { count: filtered.length, query })}{" "}
                {filtered.length > shown.length && t("pages.copy.truncated", { count: shown.length })}{" "}
                <Link href={hrefFor({ ns })} className="underline">
                  {t("common.clearFilter")}
                </Link>
              </p>
            ) : (
              <h3 className="text-base font-semibold text-adm-text">{t(`pages.copy.ns.${ns}`)}</h3>
            )}
            {!needle && (
              <a
                href={`/${uiLang}${sitePath === "/" ? "" : sitePath}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-adm-accent-ink underline-offset-4 hover:underline"
              >
                <ExternalLink size={14} aria-hidden />
                {t("pages.copy.viewOnSite")}
              </a>
            )}
          </div>

          {/* The legal pages' wording is editable; what a lead consented to
              is recorded against the version, which is not. */}
          {!needle && (ns === "privacyPolicy" || ns === "terms") && (
            <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
              {t("pages.copy.legalNote")}
            </p>
          )}

          {groups.length === 0 ? (
            <p className="admin-card px-6 py-10 text-center text-sm text-adm-muted">{t("pages.copy.empty")}</p>
          ) : (
            <fieldset disabled={!canWrite} className="contents">
              <SiteCopyForm
                key={`${ns}|${query}|${show}`}
                action={updateSiteCopy.bind(null, locale)}
                markReviewed={canWrite ? markCopyReviewed : null}
                groups={groups}
                focusKey={focusKey}
              />
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}
